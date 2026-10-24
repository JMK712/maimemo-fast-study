# 墨墨学习直达

仅作用于 `www.maimemo.com` 与墨墨自己的 `tc-apis.maimemo.com/webstudy/app`。打开 `https://www.maimemo.com/home/web_study` 后，扩展会自动勾选网页版公测须知并点击“开始学习”，让学习 iframe 铺满网页视口，并在进入学习后让浏览器进入全屏。若墨墨显示登录表单，扩展会等待 Chrome 已保存的账号和密码填入，再自动点击登录并返回学习页。

## 安装

1. 在 Chrome 地址栏打开 `chrome://extensions`。
2. 打开右上角“开发者模式”，点“加载已解压的扩展程序”。
3. 选择本文件夹 `maimemo-fast-study`。
4. 打开或刷新 `https://www.maimemo.com/home/web_study`。

若已加载旧版扩展，请在 `chrome://extensions` 中点该扩展的“重新加载”，然后刷新学习页。点击 Chrome 工具栏里的扩展图标可调整设置：总开关、自动开始、自动登录、登录后返回学习页、登录等待时间、学习内容铺满标签页、浏览器全屏。也可以从设置面板直接打开学习页或恢复默认。

无需在扩展里输入、保存或修改密码。若 Chrome 没有自动填入密码，扩展会停留在登录页供你使用 Chrome 的密码建议或手动登录；它不会读取 Chrome 密码库。首次使用时如浏览器要求选择账号，仍需你选择。

“学习内容铺满标签页”会去除网页的顶栏、底栏和白边；“浏览器全屏”会隐藏 Chrome 标签栏，效果相当于按 F11。再次按 F11 可退出。扩展不会在你手动退出全屏后反复强制进入，刷新学习页后才会再次按设置执行。

网站或浏览器本身的加载时间、网络延迟、验证码及额外验证无法由扩展保证在 1 秒内完成。扩展只提交已由 Chrome 填好的登录表单，不绕过验证。

## 本机离线发音（可选）

扩展在墨墨学习 iframe 中接管英文 `speechSynthesis.speak()`，把单词或整句发送给只绑定 `127.0.0.1:8765` 的本机服务。服务使用本地 Kokoro ONNX 模型；不会向云端发送文字或请求云端合成。原有的 `rate` 会乘以扩展里的“语速倍率”。墨墨按顺序朗读例句时，扩展在本机音频结束后触发原有的 `end` 事件，使下一句继续播放。中文发音仍走网页原实现。本机服务未安装、未运行、超时或播放失败时，自动使用网页原发音。

默认开启“提前缓存当前单词的三条例句”。墨墨在载入单词卡时就提供完整例句，因此扩展会让本机服务提前合成；播放按钮按下时，若已完成合成，直接取内存缓存。下一张卡在提交当前单词后才返回，扩展在它到达时立即开始预生成，并优先处理第一句。首次模型加载也因此提前到卡片出现时。站点模块结构变化会使预缓存停用，但按键后的即时合成仍可使用。可在扩展设置中关闭预缓存，恢复首次发音时才加载模型的行为。

墨墨目前的学习协议只提供当前卡片，以及提交答案后返回的下一张卡；取词请求没有“再往后两张”的只读预览参数。后续单词也可能受当前回答影响。因此扩展不能准确地提前合成“下下个词”，不会通过伪造提交答案来推进学习记录。已完成的卡片音频会留在内存缓存中，方便快速重播。

墨墨的**单词卡片主发音**目前使用站点提供的 MP3，而非 Web Speech；本扩展接管的是 Web Speech 请求。服务 API 可以合成单词，但不会改写站点的 MP3 链接。这一点可以避免破坏墨墨自己的英美口音选择和自动播放顺序。

### 模型选择

| 模型 | 声音观感 | 模型体积 | 在本机 4 核 Intel i5 上的取舍 |
| --- | --- | ---: | --- |
| Kokoro 82M v1.0（选用） | 英文语调较自然；仍不能保证与 Microsoft Natural HD 相同 | FP32 326 MB + 声音库 28 MB；另有 164 MB FP16 / 114 MB INT8 版本 | 已实测可在 CPU 离线合成，首次加载约 2.5 秒 |
| Piper en_US lessac high | 清晰、轻量，语调通常更机械；这是主观听感判断 | 约 114 MB，单一声音 | 速度和占用更有优势，音质目标不如 Kokoro 合适 |
| F5-TTS v1 | 可做高质量声音克隆，依赖参考音频 | 权重约 1.35 GB | CPU 首次使用和推理负担更大，且预训练权重为非商业许可 |

来源：[Kokoro ONNX 与模型发布页](https://github.com/thewh1teagle/kokoro-onnx)、[Kokoro 模型卡](https://huggingface.co/hexgrad/Kokoro-82M)、[Piper 项目](https://github.com/OHF-Voice/piper1-gpl)、[F5-TTS 项目](https://github.com/SWivid/F5-TTS)。表中的声音观感是选择依据，不是同条件盲听评分。

在这台电脑上，网络连接被测试脚本禁止时，Kokoro FP32 的单词 `savings` 合成约 1.4 秒、例句合成约 2.7 秒。通过本机 HTTP 服务首次请求（含模型加载）约 5.1 秒，后续相同单词在不同语速下约 0.8 秒。播放时间取决于词句长度。首次发音无法保证 1 秒内开始。

预缓存更新后的本机测试：三条例句的缓存任务约 81 毫秒即可入队；任务完成后，第三句的本机 API 命中耗时约 15 毫秒。该数值是 API 响应时间，不包括浏览器解码与音频设备启动时间。若用户在预生成尚未结束时立刻播放，该句仍需等待合成。

对较小的 Kokoro INT8 模型做了同机断网测试：相同例句在 FP32 上约 2.3–2.5 秒，INT8 单独运行约 37 秒；本机 CPU 上“模型更小”并未带来更快播放。官方发布页还给出 INT8 与 FP32 的频谱相关性为 0.916。保留 FP32 并提前缓存，比直接改用 INT8 更符合本机的速度和音质目标。

### 安装和启动（Windows）

1. 安装 Python 3.12 或 [uv](https://docs.astral.sh/uv/)。安装时需要联网下载 Python 依赖及模型；**安装完成后的合成完全离线**。
2. 在 PowerShell 中进入本扩展文件夹，运行 `powershell -ExecutionPolicy Bypass -File .\local_tts\install.ps1`。脚本下载并校验 Kokoro 模型，安装本机运行环境，生成随机配对令牌。模型存放在 `%LOCALAPPDATA%\MaiMemoFastStudy`，不会进入 Git 仓库。
3. 运行 `powershell -ExecutionPolicy Bypass -File .\local_tts\start.ps1` 启动隐藏的本机服务。每次 Windows 重新启动后需要再次运行这一命令。
4. 在 `chrome://extensions` 加载本扩展文件夹；如果已经加载，点“重新加载”，再刷新墨墨学习页。保持设置中的“使用本机 Kokoro 发音”开启。

若 Python 3.12 不是系统默认解释器，可给安装脚本传入路径：`powershell -ExecutionPolicy Bypass -File .\local_tts\install.ps1 -PythonPath 'C:\path\to\python.exe'`。

服务只监听本机 IPv4 回环地址，要求安装时生成的随机令牌；扩展后台只接收墨墨学习 iframe 的请求。网页不能读取扩展中的令牌。与任何本机进程一样，拥有同一 Windows 用户权限的程序仍能读取用户文件；这不是操作系统隔离边界。

### 停止和卸载

- 暂停离线发音：关闭扩展设置中的“使用本机 Kokoro 发音”，或运行 `powershell -ExecutionPolicy Bypass -File .\local_tts\stop.ps1`。下一次 Web Speech 请求会回退到原发音。
- 删除模型、运行环境与配对令牌：运行 `powershell -ExecutionPolicy Bypass -File .\local_tts\uninstall.ps1`。随后如需移除扩展，在 `chrome://extensions` 点击“移除”。
