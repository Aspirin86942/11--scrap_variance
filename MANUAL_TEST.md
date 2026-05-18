# WPS 真机测试

## 按钮 action 真机测试入口

这个入口只在 WPS 真实运行环境里产生真机测试结果。Node/Vitest 只能验证 core、注册表和 WPS adapter mock，不允许把 Node 输出当成 WPS 真机结果。

1. 启动本地加载项服务：

   ```bash
   npm run dev
   ```

2. 在 WPS 中打开测试工作簿，确保 OA/ERP 源数据工作表存在。

3. 在 WPS 中按 `ALT + F12` 打开 JS 调试器，执行：

   ```js
   await window.__WPS_RUN_ALL_BUTTON_TESTS__()
   ```

4. 返回值是数组，每项结构为：

   ```js
   {
     name: "runPrecheck",
     ok: true,
     message: "已调用按钮 action"
   }
   ```

`__WPS_RUN_ALL_BUTTON_TESTS__()` 会调用真实按钮背后的 action，不使用 Node mock，也不使用替代测试函数。`ok: false` 表示该 action 在当前 WPS 工作簿、当前活动工作表或当前选区下真实失败，`message` 是失败原因。不要手工改写为通过。

`queryCurrentSheet` 的 `ok: true` 表示已经真实调用查询按钮 action，并且 WPS 接受了 `ShowDialog` 调用。随后需要在弹窗中点 `查询` 或 `取消` 来完成该次弹窗交互；如果 5 分钟内没有返回结果，加载项会报告查询弹窗超时。

## GUI 点击冒烟测试

GUI 点击只用于冒烟，不作为主要验证方式。

- X11：可以使用 `xdotool` 激活 WPS 窗口并点击一个代表性按钮，然后检查日志或单元格结果。
- Wayland：不默认使用 `xdotool`；使用桌面环境支持的自动化工具，或手工点击一个代表性按钮后检查日志或单元格结果。
