// @ts-nocheck
// Type definitions for Three.js
declare module 'three' {
    export class Vector3 {
        x: number;
        y: number;
        z: number;
        constructor(x?: number, y?: number, z?: number);
        set(x: number, y: number, z: number): this;
        copy(v: Vector3): this;
        clone(): Vector3;
        add(v: Vector3): this;
        sub(v: Vector3): this;
        multiplyScalar(s: number): this;
        divideScalar(s: number): this;
        length(): number;
        distanceTo(v: Vector3): number;
        normalize(): this;
        lerp(v: Vector3, alpha: number): this;
        
        // Add missing Vector3 methods
        subVectors(a: Vector3, b: Vector3): this;
        addVectors(a: Vector3, b: Vector3): this;
        lerpVectors(a: Vector3, b: Vector3, alpha: number): this;
        crossVectors(a: Vector3, b: Vector3): this;
    }

    export class Vector2 {
        x: number;
        y: number;
        constructor(x?: number, y?: number);
        set(x: number, y: number): this;
        copy(v: Vector2): this;
        clone(): Vector2;
    }

    export class Color {
        r: number;
        g: number;
        b: number;
        constructor(r?: number | string, g?: number, b?: number);
        set(color: number | string): this;
        copy(color: Color): this;
        clone(): Color;
        lerp(color: Color, alpha: number): this;
        lerpColors(color1: Color, color2: Color, alpha: number): this;
        getHex(): number;
        setHSL(h: number, s: number, l: number): this;
        multiplyScalar(s: number): this;
        add(color: Color): this;
    }

    export class Object3D {
        position: Vector3;
        rotation: Euler;
        scale: Vector3;
        userData: any;
        visible: boolean;
        parent: Object3D | null;
        children: Object3D[];
        
        add(...objects: Object3D[]): this;
        remove(...objects: Object3D[]): this;
        traverse(callback: (object: Object3D) => void): void;
        updateMatrix(): void;
        updateMatrixWorld(force?: boolean): void;
    }

    export class Euler {
        x: number;
        y: number;
        z: number;
        constructor(x?: number, y?: number, z?: number);
    }

    export class Scene extends Object3D {
        background: Color | null;
        fog: Fog | null;
        constructor();
    }

    export class PerspectiveCamera extends Camera {
        aspect: number;
        fov: number;
        constructor(fov?: number, aspect?: number, near?: number, far?: number);
        updateProjectionMatrix(): void;
    }

    export interface WebGLRendererParameters {
        canvas?: HTMLCanvasElement;
        context?: WebGLRenderingContext;
        antialias?: boolean;
        alpha?: boolean;
        precision?: string;
        premultipliedAlpha?: boolean;
        preserveDrawingBuffer?: boolean;
        powerPreference?: string;
    }

    export class WebGLRenderer {
        domElement: HTMLCanvasElement;
        constructor(parameters?: WebGLRendererParameters);
        setSize(width: number, height: number): void;
        setPixelRatio(value: number): void;
        render(scene: Scene, camera: Camera): void;
        dispose(): void;
        forceContextLoss(): void;
    }

    export class Camera extends Object3D {
        matrixWorldInverse: Matrix4;
        projectionMatrix: Matrix4;
        constructor();
    }

    export class Matrix4 {
        elements: Float32Array;
        constructor();
    }

    export class Raycaster {
        constructor(origin?: Vector3, direction?: Vector3, near?: number, far?: number);
        setFromCamera(coords: Vector2, camera: Camera): void;
        intersectObject(object: Object3D, recursive?: boolean): Intersection[];
        intersectObjects(objects: Object3D[], recursive?: boolean): Intersection[];
    }

    export interface Intersection {
        distance: number;
        point: Vector3;
        face: Face3 | null;
        object: Object3D;
    }

    export class Face3 {
        a: number;
        b: number;
        c: number;
        constructor(a: number, b: number, c: number);
    }

    export class Material {
        opacity: number;
        transparent: boolean;
        visible: boolean;
        color: Color;
        emissive?: Color;
        dispose(): void;
        clone(): Material;
    }

    export interface LineBasicMaterialParameters {
        color?: number | string | Color;
        opacity?: number;
        linewidth?: number;
        transparent?: boolean;
        vertexColors?: boolean | number;
    }

    export class LineBasicMaterial extends Material {
        constructor(parameters?: LineBasicMaterialParameters);
    }

    export interface MeshBasicMaterialParameters {
        color?: number | string | Color;
        opacity?: number;
        transparent?: boolean;
        side?: number;
    }

    export class MeshBasicMaterial extends Material {
        constructor(parameters?: MeshBasicMaterialParameters);
    }

    export interface MeshPhongMaterialParameters {
        color?: number | string | Color;
        emissive?: number | string | Color;
        specular?: number | string | Color;
        shininess?: number;
        opacity?: number;
        transparent?: boolean;
        side?: number;
    }

    export class MeshPhongMaterial extends Material {
        emissive: Color;
        specular: Color;
        shininess: number;
        constructor(parameters?: MeshPhongMaterialParameters);
    }

    export class BufferGeometry {
        constructor();
        setAttribute(name: string, attribute: BufferAttribute): this;
        dispose(): void;
        setFromPoints(points: Vector3[]): this;
    }

    export class BufferAttribute {
        constructor(array: ArrayLike<number>, itemSize: number, normalized?: boolean);
    }

    export class SphereGeometry extends BufferGeometry {
        constructor(radius?: number, widthSegments?: number, heightSegments?: number);
    }

    export class BoxGeometry extends BufferGeometry {
        constructor(width?: number, height?: number, depth?: number);
    }

    export class PlaneGeometry extends BufferGeometry {
        constructor(width?: number, height?: number, widthSegments?: number, heightSegments?: number);
    }

    export class TetrahedronGeometry extends BufferGeometry {
        constructor(radius?: number, detail?: number);
    }

    export class Mesh extends Object3D {
        geometry: BufferGeometry;
        material: Material | Material[];
        constructor(geometry?: BufferGeometry, material?: Material | Material[]);
    }

    export class Group extends Object3D {
        constructor();
    }

    export class Line extends Object3D {
        geometry: BufferGeometry;
        material: Material;
        constructor(geometry?: BufferGeometry, material?: Material);
    }

    export class AmbientLight extends Object3D {
        constructor(color?: number | string, intensity?: number);
    }

    export class DirectionalLight extends Object3D {
        constructor(color?: number | string, intensity?: number);
    }

    export class Fog {
        constructor(color: number | string, near?: number, far?: number);
    }

    export class Clock {
        constructor(autoStart?: boolean);
        start(): void;
        stop(): void;
        getElapsedTime(): number;
        getDelta(): number;
    }

    export class CubicBezierCurve3 {
        constructor(v0: Vector3, v1: Vector3, v2: Vector3, v3: Vector3);
        getPoint(t: number, optionalTarget?: Vector3): Vector3;
    }

    export class TubeGeometry extends BufferGeometry {
        constructor(
            path: CubicBezierCurve3, 
            tubularSegments?: number, 
            radius?: number, 
            radialSegments?: number, 
            closed?: boolean
        );
    }

    // Constants
    export const DoubleSide: number;
}

declare module 'three/examples/jsm/controls/OrbitControls.js' {
    import { Camera, Vector3 } from 'three';

    export class OrbitControls {
        constructor(camera: Camera, domElement?: HTMLElement);
        enabled: boolean;
        target: Vector3;
        minDistance: number;
        maxDistance: number;
        minPolarAngle: number;
        maxPolarAngle: number;
        minAzimuthAngle: number;
        maxAzimuthAngle: number;
        enableDamping: boolean;
        dampingFactor: number;
        enableZoom: boolean;
        zoomSpeed: number;
        enableRotate: boolean;
        rotateSpeed: number;
        enablePan: boolean;
        panSpeed: number;
        screenSpacePanning: boolean;
        keyPanSpeed: number;
        autoRotate: boolean;
        autoRotateSpeed: number;
        update(): boolean;
        dispose(): void;
    }
}

declare module 'three/examples/jsm/renderers/CSS2DRenderer.js' {
    import { Object3D, Scene, Camera } from 'three';

    export class CSS2DObject extends Object3D {
        constructor(element: HTMLElement);
        element: HTMLElement;
    }

    export class CSS2DRenderer {
        constructor();
        domElement: HTMLElement;
        setSize(width: number, height: number): void;
        render(scene: Scene, camera: Camera): void;
    }
}



