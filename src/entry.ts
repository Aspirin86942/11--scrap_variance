import { runAllButtonActionTests } from "./actions/button-actions";
import { createDefaultButtonActions, createWpsRibbon } from "./main";
import type { ScrapVarianceGlobal } from "./types/wps";

const root = globalThis as ScrapVarianceGlobal;
const buttonActions = createDefaultButtonActions(root);

// WPS 只认识挂到全局对象上的 ribbon 回调；这里把 TypeScript 模块里的实现注册成 WPS 能调用的入口。
root.buttonActions = buttonActions;
root.ribbon = createWpsRibbon(root, buttonActions);
// 测试入口也挂到全局对象，便于真机 WPS 环境验证每个按钮背后的 action。
root.__WPS_RUN_ALL_BUTTON_TESTS__ = () => runAllButtonActionTests(buttonActions);
