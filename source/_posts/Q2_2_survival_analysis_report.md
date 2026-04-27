---
title: 生存分析报告
date: 2026-04-27
categories:
  - 数据分析
tags:
  - 生存分析
  - Cox模型
  - 统计建模
---


本实验的核心任务是使用 **生存分析（Survival Analysis）** 方法研究客户从签约到流失之间的时间规律。这里的“事件”是客户流失 **churn**，时间变量是客户在网时长 **tenure**。与普通分类问题不同，生存分析不仅关心“会不会流失”，更关心“什么时候流失”。

## 生存分析的理论基础

设随机变量 **T** 表示客户从签约到流失所经历的时间，则生存分析中最重要的两个函数是：

### 1. 生存函数（Survival Function）
[图片]

表示客户“至少还能存活到时刻 \(t\) 之后”的概率。

### 2. 风险函数（Hazard Function）
[图片]

表示客户在“已经活到 \(t\)”这一条件下，在下一瞬间发生流失的即时风险。

生存分析与普通回归/分类最大的不同，是它能够处理 **删失（censoring）**。在这个实验里，很多客户在观察结束时仍未流失，这类样本就叫 **右删失（right-censored）**。如果不考虑删失，直接拿平均 tenure 做分析，会系统性低估客户真实寿命。Kaplan–Meier 正是为解决这个问题而设计的；Cox 模型和 AFT 模型则是在此基础上进一步引入协变量解释风险差异。

---

## Part1: 数据导入与处理

### 数据集基本信息

本项目的数据集是 **IBM 的 Telco Customer Churn 数据集**，这个数据集刻画了一家虚构电信公司客户的基本特征与服务状态，并且特别适合作为生存分析的案例，因为它天然包含时间变量 **tenure** 与事件变量 **churn**。

在这个数据集里，除了 tenure 与 churn 之外，其余特征大多是解释变量，例如 gender、seniorCitizen、partner、dependents、phoneService、multipleLines、internetService、onlineSecurity、onlineBackup、deviceProtection、techSupport、streamingTV、streamingMovies、paperlessBilling、paymentMethod 等。这些变量既可以在 Kaplan–Meier 中被逐个拿出来做单变量分组比较，也可以在 Cox 或 AFT 里通过 one-hot 编码作为协变量进入模型。

样本共有 **3351** 个观测，其中 **1795** 个是右删失样本，说明超过一半客户在观测期结束前还没有流失。这正是必须使用生存分析而不是普通分类的原因。

### Bronze / Silver 表的构建逻辑

首先下载原始 CSV，定义明确的 schema，用 Spark 读取数据，再把结果写入 Bronze 和 Silver 两级表。**Bronze** 保留原始数据，**Silver** 保留经过业务筛选和清洗后的分析用数据。

Silver 层则体现了分析目标导向的“数据裁剪”。notebook 在构造 `silver_df` 时做了两类重要转换。第一类是把原始的 `churnString` 从 Yes/No 文字字段转成数值型 `churn`，其中 `Yes -> 1`，`No -> 0`。第二类是基于业务目标过滤样本，只保留 `contract == 'Month-to-month'` 且 `internetService != 'No'` 的客户。也就是说，这份分析并不是在研究全部用户，而是刻意聚焦在月付且确实订购了互联网服务的客户群。从实验设计角度看，这样做有两个好处：一是样本更加同质，二是研究问题更聚焦于最典型的留存风险场景。

随后，把 bronze 和 silver 都写入 Delta Lake，并分别创建 `bronze_customers` 与 `silver_monthly_customers` 两张表。这样做的意义并不仅仅是持久化，而是把后续所有模型的输入都固定在一张经过整理的分析表上。

---

## Part2: Kaplan–Meier 模型与 Log-Rank 检验

### 数学原理

Kaplan–Meier（KM）方法是一个**非参数模型**，用于直接估计生存函数 \(S(t)\)。它的核心估计式是：

[图片]

其中：

- \(t_i\) 是第 \(i\) 个发生事件的时点；
- \(d_i\) 是该时点发生流失的人数；
- \(n_i\) 是该时点之前仍然“处于风险集”中的人数。

它的关键优点在于能处理删失样本，因此不会像简单的均值或中位数那样低估生存概率。

为了比较不同组别的生存曲线是否真正不同，配合使用 **Log-Rank 检验**。它本质上是一个卡方检验，原假设是“不同组别的生存曲线没有显著差异”。如果 p 值很小，就说明两组的流失时间分布并不相同。

### 代码思路

在代码中，KM 部分非常清晰：

- 先取 `T = telco_pd['tenure']` 作为持续时间；
- 再取 `C = telco_pd['churn'].astype(float)` 作为事件指示；
- 用 `KaplanMeierFitter().fit(T, C)` 拟合总体生存曲线；
- 再写辅助函数 `plot_km(col)` 和 `print_logrank(col)`，分别绘制不同协变量分组下的 KM 曲线并进行 Log-Rank 检验；
- 最后用 `survival_function_at_times` 提取某个组（如 DSL 用户）在若干月份下的生存概率，供后续业务应用。

### 结果分析

#### 总体

Kaplan–Meier 模型给出的总体中位生存时间为 **34 个月**：

![图片](/source/images/image.png)

这意味着：在当前筛选后的客户群中，约有一半用户会在 34 个月之前流失，另一半会在 34 个月之后仍然留存。

生存曲线是条件概率意义上的。当它说“客户有 50% 的概率至少生存到第 34 个月”时，真正的含义不是一个静态总体平均，而是“在前面都没有流失的条件下，生存到这个时点的概率如何变化”。

同时，曲线周围的置信区间也很重要。越往后时间点，置信区间往往越宽，说明数据支持越来越弱，因为到了很长的时间轴后，仍在风险集中的客户会越来越少。

#### 协变量分组

![图片](/source/images/image(1).png)

如果某一列变量对应的不同组别有明显分离的生存曲线，那么这列变量就可能对预测很有用；反过来，如果曲线几乎重合，那么这列变量的单变量区分能力就很有限。

从 Kaplan–Meier 生存曲线及 Log-rank 检验结果来看，gender、seniorCitizen 和 phoneService 的 p 值均大于 0.05，说明这些变量在单变量层面不能显著区分客户的留存时间分布；而 partner、dependents、multipleLines、internetService、streamingTV、streamingMovies、onlineSecurity、onlineBackup、deviceProtection、techSupport、paperlessBilling 和 paymentMethod 的 p 值均小于 0.05，说明这些变量能够显著区分客户的生存曲线。其中，onlineSecurity、onlineBackup、techSupport、deviceProtection 和 internetService 的曲线分离最明显，区分能力相对更强。

### Log-Rank 检验

它的原假设是不同组的生存曲线相同。像 gender 这种曲线很近的情况，p 值大于 0.05，就意味着不能拒绝“统计等价”的原假设；而 onlineSecurity 这种曲线分开得很明显的变量，则更可能表现出显著差异。

假设公司想给客户免费送某项服务，如果 Log-Rank 检验表示“有服务”和“没服务”的留存曲线几乎一样，那就需要重新评估这项投入的回报；反过来，如果某个变量带来了显著的时间到流失差异，那么这个变量就更可能有业务优化价值。这说明生存分析并不仅仅是预测工具，它同样能支持服务设计与商业策略判断。

### 提取生存概率

Kaplan–Meier 的结果还能作为后续分析和业务模块的输入，后面会从 Cox 模型中提取相似的输出，并把它接到 Customer Lifetime Value dashboard。KM 部分一方面是统计探索，另一方面也是给后面 CLV 部分做观念铺垫。

比如，DSL 用户前 10 个时间点的生存概率提取结果为：

- month 0-9：1, 0.902, 0.864, 0.834, 0.810, 0.794, 0.783, 0.776, 0.768, 0.751

DSL 客户在最初几个月留存概率下降很快，之后下降速度逐渐放缓。也就是说，**早期留存经营** 对这类客户尤为重要。

---

## Part3: Cox Proportional Hazards（Cox 比例风险模型）

### 数学原理

Cox 模型是一个**半参数模型**，与 Kaplan–Meier 相比，Cox 更适合做多变量分析。其基本形式为：

\[
h(t \mid x) = h_0(t)\exp(\beta^\top x)
\]

![图片](/source/images/image(2).png)

它把整体 hazard ratio 拆成两部分。第一部分是 baseline hazard，即基准风险，表示当所有变量都固定在参考水平时的风险；第二部分是 partial hazard，即由协变量偏离基准水平所带来的倍率变化。

若 \(HR < 1\)，该变量会降低流失风险；若 \(HR > 1\)，说明会提高流失风险。Cox 模型把风险分成“基线风险”和“由协变量带来的比例变化”两部分，因此它本质上是在建模不同客户之间的相对风险差异。

本次拟合选择的基准风险刻意避开“和总体 KM 曲线最相近”的那一组，这样 baseline 更直观。

### 比例风险假设（proportional hazards assumption）

Cox 模型最关键的前提是假设：不同组之间的 hazard ratio 在时间上应当保持“成比例”的关系。

baseline hazard 是时间 \(t\) 的函数，但 partial hazard 不依赖时间；因此，不同组之间的风险比例应当在时间上相对稳定。

### 代码思路

在进入拟合之前，先做标准的 one-hot 编码。选取了 5 个变量：dependents、internetService、onlineBackup、techSupport、paperlessBilling。然后通过 `pd.get_dummies()` 扩展为哑变量，再从中挑选真正进入模型的列：dependents_Yes、internetService_DSL、onlineBackup_Yes、techSupport_Yes。

值得注意的是：每个 one-hot 变量都必须删掉一个水平，否则会出现多重共线性。例如，如果同时保留 dependents_Yes 与 dependents_No，那么两列完全线性相关，模型就会变得不稳定。

### 结果分析

![图片](/source/images/image(3).png)

![图片](/source/images/image(4).png)

- dependents_Yes: coef = -0.33，HR = 0.72
- internetService_DSL: coef = -0.22，HR = 0.80
- onlineBackup_Yes: coef = -0.78，HR = 0.46
- techSupport_Yes: coef = -0.64，HR = 0.53

而且这些变量的 p 值都小于 0.005，说明在统计意义上都是显著的。

这些结果可以解释为：

- 有家属依赖（dependents）的客户，流失风险约下降 28%；
- 使用 DSL 而不是基准组（光纤）时，流失风险约下降 20%；
- 购买在线备份服务的客户，流失风险约下降 54%；
- 购买技术支持服务的客户，流失风险约下降 47%。

其中影响最强的是 onlineBackup_Yes 和 techSupport_Yes。这说明“附加服务越完整，客户越不容易流失”是这个数据里非常明显的规律。原教程也特别用 internetService_DSL 的 \(HR = 0.80\) 举例说明了这种解释方式。

模型整体的 Concordance = 0.64，说明它具备一定排序能力，但并不算特别强。如果把 0.5 理解为随机猜测、1.0 理解为完美排序，那么 0.64 表示模型确实学到了一些有意义的风险差异，但还有明显提升空间。

### 检验比例风险假设：统计检验、Schoenfeld 残差与 log-log 图

#### 统计检验

[图片]

在这个模型里，四个协变量中有三个变量的检验结果提示违反了比例风险假设，也就是说，这些变量的风险比并不是稳定不变的：

- internetService_DSL 未通过比例风险检验，p < 5e-05；
- onlineBackup_Yes 未通过比例风险检验，p < 5e-05；
- techSupport_Yes 未通过比例风险检验，p = 0.0002。

#### Schoenfeld 残差

理想情况下，残差不应该随着时间表现出明显模式，因此中间黑线应当比较平。如果出现明显趋势，说明残差与时间相关。

internetService_DSL 随时间有明显稳定趋势，onlineBackup_Yes 的趋势最强，而 techSupport_Yes 在时间尾部也出现比较显著的模式。这说明这几个变量都在某种程度上违背了“固定比例风险”的设定。

[图片]

[图片]

[图片]

[图片]

#### log-log 图

通过对曲线做坐标变换，把原本不容易看清的比例关系放大出来。当比例风险假设成立时，log-log 尺度下的曲线应该大致平行：

[图片]

[图片]

[图片]

[图片]

而当前模型中，这些曲线大多并不完全平行，尤其某些变量表现出明显偏离。这进一步佐证了统计检验和 Schoenfeld 残差的结论。

这说明这些变量对流失风险的影响不是恒定的，而是会随客户存续时间变化。比如技术支持也许在入网前期影响小，在后期影响大；在线备份可能在某些生命周期阶段特别关键。于是，虽然 Cox 模型可以作为一个不错的预测工具，但若想严谨解释“某变量始终让风险降低多少”，就要更谨慎。

---

## Part4: Accelerated Failure Time（AFT，加速失效时间模型）

### 数学原理

AFT 模型与 Cox 的思想不同。Cox 的语言是“风险变成多少倍”，而 AFT 的语言是“时间被拉长或压缩到多少倍”。其常见写法为：

其中 \(\beta\) 常被解释为 **时间加速因子（acceleration factor）**。

如果 \(\exp(\beta) > 1\)，说明该变量把客户流失时间“拉长”；如果 \(\exp(\beta) < 1\)，说明把流失时间“缩短”。

[图片]

AFT 是一个**全参数模型（parametric model）**，也就是它要求你先假定持续时间服从某种具体分布。本实验中使用的是 **Log-Logistic AFT**，这意味着我们假设结果变量服从 log-logistic 分布，并给出相应的生存函数形式。

相比 Kaplan–Meier 的非参数与 Cox 的半参数，AFT 更强地依赖分布假设，因此一旦分布设定不合适，模型就会偏。

### 代码思路

在数据准备上，AFT 与 Cox 很相似。notebook 先对多个分类变量做 one-hot 编码，再保留选定列进入模型。这里选的协变量比 Cox 更丰富，包括 partner_Yes、multipleLines_Yes、internetService_DSL、onlineSecurity_Yes、onlineBackup_Yes、deviceProtection_Yes、techSupport_Yes、paymentMethod_Bank transfer (automatic) 和 paymentMethod_Credit card (automatic)。

同样强调必须删去每个 one-hot 变量中的某些列，以避免多重共线性。这一点与 Cox 完全一致，也再次说明：所有系数都必须相对于基准水平来解释。

### 结果分析

[图片]

[图片]

[图片]

- Median Survival Time = 135.51
- Concordance = 0.73
- AIC = 13698.72

从区分能力上看，AFT 的 Concordance 明显高于 Cox 的 0.64，说明它在这组数据上对客户留存时间的排序能力更强。

主要变量的 exp(coef) 结果包括：

- deviceProtection_Yes：1.62
- internetService_DSL：1.47
- multipleLines_Yes：1.94
- onlineBackup_Yes：2.25
- onlineSecurity_Yes：2.37
- partner_Yes：1.97
- paymentMethod_Bank transfer (automatic)：2.10
- paymentMethod_Credit card (automatic)：2.22
- techSupport_Yes：1.99

这些值都大于 1，说明相对于各自基准组，这些变量会把“到流失发生的时间”拉长，也就是让客户更晚流失。

### AFT 的假设检验：平行 & 直线

和 Cox 一样，经过变换的 log-log 图有助于检验模型是否违反假设；但对于 AFT，纵轴的变换形式依赖于你指定的分布类型。由于这里使用的是 log-logistic，所以采用与该分布对应的变换。

AFT 需要检查两个层面的假设。第一，是 **Proportional Odds** 假设；在图上，如果不同组的曲线大致平行，就更支持这一假设。第二，是 **specified distribution** 是否合适；如果曲线大致呈直线，就说明你选的 log-logistic 分布较为合理。

#### 结果

[图片]

大多数图中的线条相对比较直，虽然存在一定偏差，但整体还不错，因此把 log-logistic 作为结果时间分布是合理的；但是大多数曲线并不平行，因此说明 AFT 结构本身并不完全适合这组变量。

### 小结

Cox 之所以常用，很大程度上是因为它不需要先假设时间分布；而 AFT 虽然在解释上很直观，也能给出“时间尺度变化”的说法，但它对分布与结构假设更敏感。

因此，在真实实践中，如果目标是 inference，就应当优先选择更符合假设的模型；如果目标是 prediction，则应更关注谁的预测表现更好。

对于本该数据，AFT 虽然作为方法展示很有价值，但并不是一个完全理想的最终模型，还建议继续探索前一个 Cox notebook 里列出的更灵活改造方案。

---

## Part5：Customer Lifetime Value（CLV）

### 主要流程

把前面学到的生存分析结果接到经营分析中去：把生存分析模型的输出作为 Customer Lifetime Value dashboard 的输入。

先用 Cox 模型预测某一类客户未来每个月还留存的概率，然后把这个概率乘以每月利润，再对未来现金流折现，得到累计净现值。

### Step1：重新拟合 Cox 模型

重新读取 `silver_monthly_customers`，再次执行和 Cox notebook 很类似的 one-hot 与模型拟合流程。仍然使用 dependents_Yes、internetService_DSL、onlineBackup_Yes、techSupport_Yes 等变量拟合 Cox 模型。

### Step2：Widgets —— 把客户画像变成可交互输入

创建了一组 dashboard widgets，包括 dependents_Yes、internetService_DSL、onlineBackup_Yes、techSupport_Yes、partner_Yes 与 internal rate of return。前几项实际上是在描述某种客户画像，最后一项则表示贴现率。

它不是一次性对全体客户计算平均 LTV，而是允许用户指定一个目标客户群，然后让系统即时输出这类客户的 survival probability 与累计净现值。这使得模型不再只是“统计输出”，而变成了一个可以互动使用的经营分析工具。

### Step3：CLV 计算

最关键的代码是 `get_payback_df()`。这个函数做了完整的价值转化链条。

1. 从 widgets 中取出参数，构造一个只有一行的 DataFrame，代表当前所选客户画像。
2. 把年化内部收益率 internal rate of return 除以 12，近似转化为月贴现率。
3. 调用 `cph.predict_survival_function(df)` 生成该客户画像的未来生存概率曲线，并把这一列命名为 Survival Probability。
4. 假设每月利润固定为 30，计算 `Avg Expected Monthly Profit = Survival Probability × Monthly Profit`。（这里只是演示，应填入真实数据）

[图片]

5. 利用净现值公式对各月收益做折现。

[图片]

6. 对每个月的 NPV 做累加，得到 Cumulative NPV。

[图片]

这正是整个 CLV 的数学核心：

**留存概率 → 期望利润 → 折现后利润 → 累计客户价值**

### 结果分析

#### Survival Probability

[图片]

Survival Probability 直接来自模型预测；  
Monthly Profit for the Selected Plan 是演示用的固定常数 30；  
Avg Expected Monthly Profit 表示客户在该月仍存活的概率乘以其月利润，因此是一个“按留存概率加权后的平均期望收益”；  
NPV of Avg Expected Monthly Profit 则进一步把这个收益折现到今天；  
Cumulative NPV 是前面所有月份折现收益的累计和。

- 第 1 个月 = 1.00
- 第 2 个月 = 0.87
- 第 12 个月 = 0.59
- 第 24 个月 = 0.43
- 第 25 个月 = 0.42

#### Cumulative NPV

[图片]

对应的累计净现值（Cumulative NPV）为：

- 第 12 个月约 251.40
- 第 24 个月约 405.44
- 第 25 个月约 415.76

这说明：即便单月利润固定为 30 元，随着留存概率下降和贴现效应累积，客户带来的边际收益会越来越小，但累计价值仍在持续增长。这个图表本质上是在衡量回本周期 payback period 和“可接受的获客成本上限”。

#### 留存概率曲线

[图片]

根据 widgets 中选择的一类客户画像动态生成的。

### 补充

CLV 的结论高度依赖两个外生假设：

- 月利润固定为 30；
- 折现率固定为 10%。

因此，CLV 数值可以用来说明方法，但不能直接当作企业真实经营结论。

---

## Part6: Summary

暂时无法在飞书文档外展示此内容。

在 Cox 与 AFT 两部分的比较传递出一个成熟的统计态度：**没有哪种方法永远最好，关键在于目标是推断还是预测，以及模型假设是否足够合理。**
