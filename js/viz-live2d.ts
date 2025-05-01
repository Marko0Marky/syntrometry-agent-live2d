declare const PIXI: {
    Application: any;
    live2d: {
        Live2DModel: {
            from: any;
        };
    };
};

const container = document.getElementById('live2d-container') as HTMLDivElement;

let live2dModel: any | null = null;

//const modelUrl: string = 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru.model.json';

async function initLive2D(): Promise<void> {
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
    }) as any;

    container.appendChild(pixiApp.view);

    try {
        live2dModel = await PIXI.live2d.Live2DModel.from('assets/shizuku/shizuku.model.json', {});
        pixiApp.stage.addChild(live2dModel);
        setupHitAreas(live2dModel);
        live2dModel.on('hit', (hitAreaNames: any[]) => {
            console.log(hitAreaNames);
        });
    } catch (error) {
        console.error(error);
    }

    window.addEventListener('resize', () => {
        pixiApp.renderer.resize(container.clientWidth, container.clientHeight);
    });
}

function setupHitAreas(model: any) {
    for (const hitArea of model.hitAreaFrames) {
        model.internalModel.getDrawableById(hitArea.name);
    }
}


initLive2D();