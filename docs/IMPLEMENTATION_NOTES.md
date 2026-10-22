# Klee 的雅思词卡

私人雅思词卡：完整导入原 PDF 的全部主词与彩色替换词，526 张去重词卡、原创例句、逐词离线释义、生词本和浏览器本地学习记录。

无需安装依赖或配置 API Key。发布目录为 `dist/`，直接以静态网站运行。

运行 `node check.cjs` 检查全部例句与替换表达的释义覆盖。使用浏览器实际检查点词、保存、刷新恢复和语音回调。语音通过 Web Speech API 调用设备提供的英语声音；真实手机是否可听见需在该设备确认。

首页只展示计划；点“今日待新学”进入 `#new`，点“今日待复习”进入 `#review`，自由浏览使用 `#browse`。学习页提供返回首页、进度条和每次换卡自动回到顶部，支持浏览器前进/后退和刷新当前页面。

每日新学目标默认 10 个，可在首页“调整计划”设置 1–200 个。首页分别显示今日待新学与待复习数，复习区分现在到期和今天稍后到期；超过日期的旧词也计入待复习。首次学习日期单独保存，复习不会占用新词名额，旧版记录迁移时保留已有进度。

新学和到期复习均使用三轮循环：第一轮只显示英文单词和形近/音近易混词义四选一，不显示例句或发音入口，第二轮只看英文词与英文例句，第三轮只看英文词。答错或在展开后点击“其实记错了”会退回第一轮，并穿插其他词。题目、轮次、选项顺序和已展开状态都保存于当前浏览器。

所有题目先静默，选择释义或是否记得后展开完整卡片，自动读单词和例句。手机浏览器拦截或迟迟不启动自动播放时，在底部操作区立即提供播放入口；启动失败会自动恢复一次并使用系统默认英语声音重试，使用开始/词边界事件以及引擎 speaking 状态确认开始，避免漏掉 start 事件时被启动超时取消。启动最长等待 6 秒，只对未启动的请求恢复一次，已经在播放的例句没有超时截断；播放中的真实错误显示中断提示，不会从头自动循环重播。Safari 空闲时不会反复清空语音队列，换卡取消后稍作间隔再启动。没有付费语音 API。干扰项的对应英文在选错后才显示。

当天新词通过三轮后计入已学；当天目标完成后首页解锁“拼写今日新词”。到期旧词三轮通过后自动进入拼写，拼对并确认后才从待复习中移走。拼写题提交前只显示词性和中文释义，无英文/例句/发音提示；拼错会穿插重试，支持英美规范拼写和短语空格标准化。

新词三轮完成后安排次日当地时间 04:00 复习。复习三轮和拼写都确认完成后，若全程无错，间隔依次为 3、7、14、30、60 天，之后每 60 天复习；若回忆中答错、改口、拼错或选择忘记了，则次日再复习并从 3 天间隔重新开始。历史记录没有间隔阶段时，下一次干净复习按 3 天起算；现有到期日保留到下一次完成。间隔从实际完成日计算，按设备当地时间安排。原来 20 张卡片的 ID、内容、记录与生词本保留。

熟悉的词可在回忆题、拼写题或完整词卡上标为“已掌握”。这会永久从新学、复习和拼写队列中移除词卡，直到在词卡或词库的“已掌握”筛选中手动撤销。词卡和真实学习历史保留；撤销从未学过的词会回到新词池，撤销已学过的词会在次日 04:00 进入复习并从 3 天间隔重新开始。标记操作不算完成学习目标或打卡。

来源：用户提供的《雅思阅读+538+考点词、同义替换词-刘洪波pdf.pdf》第 2–15 页。逐表提取 376 个主词、151 个彩色替换词；principle 重复一次，合并后 526 张。原文标称 538 与实际可核对条目数不同，不补词凑数。按三类的主词、彩色补充词顺序学习，内部 ID 保持稳定。原文 mange to do 改为 manage to do；同时校正 compensate、extinct、vanish、civic、visual 等明显词性或释义错误。关联线索需结合语境理解，不作为无条件等价替换。

学习页使用动态视口高度的一屏布局：标题/进度在上、词卡在中、操作区在底部，不需要滚动。完整词卡默认显示例句，点击“表达与用法”切换补充内容，保留逐词查询。小屏幕和软键盘出现时压缩间距。

点词弹窗提供各词性及相应的中文释义（不限定原例句），同时显示英文缩写与中文词性名。复数、第三人称单数等词形标明原形，并列出原形的词性与释义；used、made、better 等有独立用法的变形词保留各自的词性。短语按整体语法功能标注。词性和简明中文释义均在本地词库中，无须运行时查询 API。多词性核对参考 Cambridge Dictionary（例如 prompt）与 BBC Learning English（light）；释义为简明学习整理，不是词典全文。

四选一选错不展开卡片：原选项变红并显示对应英文易混词，自动只读该易混词；可以再次点错项重听。选中正确释义才展开完整词卡并读单词与例句。曾选错的这一轮仍计为记忆失误，继续后从第一轮穿插重练；错项、选项顺序与当前题目可在刷新后恢复，新学和复习均适用。

底部导航的“打卡”可打开学习日历：当天完成至少 5 个新词的三轮练习，或完成全部当天待复习词的三轮与拼写，自动打卡。待复习集合包括逾期词及当天稍后到期词；空复习日不算完成。日历可切月份、点日期查看完成数量，记录与学习进度一起保存在当前浏览器并随备份导出。只从保留的三轮完成状态补记可核实的新词，历史复习不推测补记。

拼写页会同时跟随可见视口的高度及顶部偏移，键盘开启时使用紧凑布局，提交或选择“忘记了”时先收起输入框。该按钮显示正确卡片并朗读，不计通过，继续后穿插重拼。视口处理参考 [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)。

新词三轮完成并解锁每日拼写、当天全部复习（三轮及拼写）完成、当天新词拼写全部完成时，显示短暂的星光纸片庆祝。每类每天一次，记录在本地避免刷新重复；可点收下关闭，也会自动收起；遵循减少动态效果设置，不添加声音。

首页解锁的“拼写今日新词”紧接今日新学/复习任务，小屏压缩首页留白以便首屏点到；打卡状态、累计天数和月历统一放在打卡弹窗。最后一轮仍在核对完整卡片并继续后才计入“已过”，可先选择“其实记错了”重新循环。

打开新版时，旧版固定在当地 09:00 到期的记录会自动移至原日期 04:00，并保存到当前浏览器；不改变复习日期、学习记录或三轮/拼写进度，也不调整其他时间的短期重练记录。

拼写题显示词卡的词性和中文释义；拼写题自动显示站内 QWERTY 键盘（26 字母、空格、连字符、撇号与删除），不会唤起系统输入法或自动补全，也支持电脑物理键盘。草稿随按键保存在当前题目，刷新后保留。拼对时立即在顶部“已过”及进度条中计入，继续核对翻卡后仍只计一次；复习排期和打卡仍在确认继续时记入。

拼写输入区用字母短横线代替输入框：按当前词卡英文的字母数显示横线，短语空格处留出空隙，输入的字母填入对应位置；超出的字符提示删除，不提前揭示答案或判断单个字母的正误。键盘始终显示，无收起按钮；删除键在右下角加宽，连字符与撇号使用小键，保留大空格键，不显示清空键。


首页页眉的小书圆环显示本书累计完成的新词数 / 总词数，三轮核对并确认继续后才增加；复习或重复浏览不会重复计数。页面文案和总数从 book/cards 数据生成，当前仅启用一本词书，不提供切书入口。

整本补充 506 张原创学习素材，并使用 ECDICT（MIT）补充音标、词形及各词性释义；应用随包提供 3,225 个离线词条，覆盖全部例句、选项和展示的关联词。保留 203 个已人工核对的词条，另有 source/dictionary-overrides.json 修正缩略词性及明显过时释义。词典许可位于 dist/dictionary-license.txt；源项目 https://github.com/skywind3000/ECDICT 。

可复现内容构建：先准备该项目的 ecdict.csv，再运行 python scripts/build-book.py /absolute/path/ecdict.csv，然后 node check.cjs。原始词表核对数据在 source/pdf-rows.json、source/book-base.json；原创内容在 content/batch-1.json 至 batch-3.json；构建覆盖报告在 source/build-audit.json。只将使用的词条带入前端，不在运行时调用词典 API。未来增加词书时应分配独立 book.id 和持久化命名空间，避免复用旧书卡片 ID。

复习拼写队列会排除已通过与重复条目；通过记录以当前三轮复习批次的 spelled 状态为准，避免上一轮记录跨期混入。最后一题正确时显示全部拼对与“完成复习”按钮，确认后显示完成页、安排下次复习并检查打卡；短语漏空格会明确说明原因。


## Private cloud sync

The existing owner-private Sites site now serves a self-contained Worker and uses a Sites-managed Cloudflare D1 binding `DB`. Build with `node scripts/build-cloud.cjs`; the editable browser assets remain in `dist/`. The build embeds those assets in `dist/server/index.js`. Schema migrations are in `drizzle/` and Sites applies them before publication.

`GET/PUT /api/sync` scopes records to the Sites-injected `oai-authenticated-user-id`; writes require a same-origin JSON request and compare-and-swap revision. Missing progress IDs or historical check-in dates cannot overwrite an existing record. The site audience remains owner-only. No external bot access or public progress endpoint is included.

The browser merges completed progress, review dates/stages, check-in evidence, permanently mastered words, saved vocabulary, celebrations and settings. First use retains a complete local backup under `klee-ielts-v1-before-cloud`, plus an immutable initial durable snapshot per device in D1. The first phone refresh uploads its existing records; deployment alone cannot access the phone's Safari storage. Devices retain unfinished recall/spelling queues locally. Offline changes retry after reconnect; explicit unmark/unsave operations use three-way merging against the last acknowledged state. Do not clear local data until the visible status says cloud sync completed.

Validation: `node check.cjs`, `node check-cloud-state.cjs`, build, then `node check-cloud.cjs`. The latter runs the actual Worker against SQLite and two independent browser-adapter contexts to test migration, isolation, conflicts, offline removals, in-flight edits and reconnection. Local test records never go to production.


## Grok Bot daily check-in link

The private app publishes only today's confirmed check-in boolean and synchronization timestamps to a separate capability-protected status Site. `CHECKIN_PUBLISH_URL`, `CHECKIN_WRITE_KEY` and `CHECKIN_READ_URL` are server runtime secrets. The link is returned only to a signed-in owner through `/api/checkin-link` and shown under settings. It cannot read or modify vocabulary progress. The original Site audience is unchanged. Publisher failure does not block cloud progress; each later sync GET/PUT retries publication. Initial bootstrap uses the existing cloud record, never fabricated completion. The status page uses Asia/Shanghai dates and distinguishes missing initial data from an unchecked day. Incomplete/offline phone records must sync before a bot can observe them.


## Longer first recall and visible spelling feedback

New words wait six intervening cards after the first meaning-choice answer before their first recall. Ready first recalls take priority so later third rounds do not push them far back. Batches smaller than seven use the available other words; they do not add words beyond the daily target. Saved waiting queues migrate once to the new delay, preserving active questions and completed progress.

Both new-word spelling and review spelling show an explicit green “拼对了” or red “拼错了” verdict, plus side-by-side aligned entered/correct spellings. Incorrect characters are red; missing/extra letters and spaces are aligned so a single omission does not mark the whole remaining word wrong. The comparison uses the closest accepted spelling, including valid alternatives. Forgotten answers remain separate from wrong attempts. The existing card, audio, retry queue and final confirmation remain available.
