import { runAllButtonActionTests } from "./actions/button-actions";
import { createDefaultButtonActions, createWpsRibbon } from "./main";
import type { ScrapVarianceGlobal } from "./types/wps";

const root = globalThis as ScrapVarianceGlobal;
const buttonActions = createDefaultButtonActions(root);

root.buttonActions = buttonActions;
root.ribbon = createWpsRibbon(root, buttonActions);
root.__WPS_RUN_ALL_BUTTON_TESTS__ = () => runAllButtonActionTests(buttonActions);
