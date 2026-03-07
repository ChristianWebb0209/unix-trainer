import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { runWebGpuProgram } from "../../../services/webgpuExecution";

export type WebGpuPanelHandle = {
    getCanvas: () => HTMLCanvasElement | null;
};

type WebGpuPanelProps = {
    code: string;
    /** When this changes, run WebGPU with current code. */
    runTrigger: number;
};

export const WebGpuPanel = forwardRef<WebGpuPanelHandle, WebGpuPanelProps>(function WebGpuPanel(
    { code, runTrigger },
    ref
) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useImperativeHandle(ref, () => ({
        getCanvas: () => canvasRef.current,
    }));

    useEffect(() => {
        if (runTrigger === 0) return;
        const canvas = canvasRef.current;
        if (canvas) void runWebGpuProgram(canvas, code);
    }, [runTrigger, code]);

    return (
        <canvas
            ref={canvasRef}
            width={600}
            height={600}
            style={{
                flex: 1,
                minHeight: 0,
                width: "100%",
                backgroundColor: "#000",
                display: "block",
            }}
        />
    );
});
