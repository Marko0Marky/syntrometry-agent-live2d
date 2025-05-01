"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const container = document.getElementById('live2d-container');
let live2dModel = null;
const modelUrl = 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru.model.json';
function initLive2D() {
    return __awaiter(this, void 0, void 0, function* () {
        const width = container.clientWidth;
        const height = container.clientHeight;
        const pixiApp = new PIXI.Application({
            width: width,
            height: height,
            backgroundAlpha: 0,
            backgroundColor: 0xFFFFFF,
            antialias: true,
            autoStart: true,
            resizeTo: container
        });
        container.appendChild(pixiApp.view);
        try {
            live2dModel = yield PIXI.live2d.Live2DModel.from(modelUrl);
            pixiApp.stage.addChild(live2dModel);
            setupHitAreas(live2dModel);
            live2dModel.on('hit', (hitAreaNames) => {
                console.log(hitAreaNames);
            });
        }
        catch (error) {
            console.error(error);
        }
        window.addEventListener('resize', () => {
            pixiApp.renderer.resize(container.clientWidth, container.clientHeight);
        });
    });
}
function setupHitAreas(model) {
    for (const hitArea of model.hitAreaFrames) {
        model.internalModel.getDrawableById(hitArea.name);
    }
}
initLive2D();
