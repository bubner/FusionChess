/**
 * Stockfish compatibility module for displaying current evaluation status information.
 * Compatible with FEN strings only. Limitations include FusionChess's dual board nature.
 * @author Lucas Bubner, 2023
 */
import { Chess } from "chess.js/src/chess";
import { useEffect, useRef, useState } from "react";

class Engine {
    engine: Worker;
    eval: string;
    fen: string;
    depth: number;
    evalBarHeight: number;

    constructor(fen: string, depth: number) {
        this.engine = new Worker("/stockfish.js");
        this.eval = "0.0";
        this.fen = fen;
        this.depth = depth;
        this.engine.onmessage = (event) => this.onStockfishMessage(event, this.fen);
        this.evalBarHeight = 50;
    }

    onStockfishMessage = (event: MessageEvent, fen: string) => {
        console.debug(event.data);
        if (event.data.startsWith("info depth")) {
            let messageEvalType;
            const message = event.data.split(" ");
            const chess = new Chess();
            chess.load(fen);
            const turn = chess.turn();

            if (message.includes("mate")) {
                messageEvalType = `M${message[message.indexOf("mate") + 1]}`;
            } else {
                messageEvalType = message[message.indexOf("cp") + 1];
            }

            const evalres = String(messageEvalType / 100.0);
            const evaluation = this._convertEvaluation(evalres, turn);
            // Check if the eval is NaN
            if (evaluation.includes("NaN")) {
                // Must be a M value
                if (messageEvalType === "M0") {
                    messageEvalType = turn === "w" ? "0-1" : "1-0";
                }
                this.eval = messageEvalType;
                // Strange occurances with negative checkmate, we simply remove negative symbol
                if (this.eval.includes("-") && !(this.eval.startsWith("0") || this.eval.startsWith("1"))) {
                    this.eval = this.eval.replace("-", "");
                }
            } else {
                this.eval = evaluation;
            }

            let heightEval: number;
            if (messageEvalType.startsWith("M")) {
                // Is checkmate in X, fill the whole bar depending on which side is winning
                heightEval = turn === "w" ? 0 : 100;
            } else {
                heightEval = this.eval.startsWith("-")
                    ? 50 + this._calcHeight(Math.abs(Number(this.eval)))
                    : 50 - this._calcHeight(Math.abs(Number(this.eval)));
            }
            this.evalBarHeight = heightEval;
        }
    };

    private _calcHeight = (x: number) => {
        // Height calculation code for eval bar. Don't ask what it does, I don't know either, but it somehow works.
        // https://github.com/trevor-ofarrell/chess-evaluation-bar/blob/57ea5d6ae8b63c3a2b0fbf4b7ef7af89dfeef6b1/dist/components/EvalBar.js#L70-L78
        if (x === 0) {
            return 0;
        } else if (x < 7) {
            return -(0.322495 * Math.pow(x, 2)) + 7.26599 * x + 4.11834;
        } else {
            return (8 * x) / 145 + 5881 / 145;
        }
    };

    private _convertEvaluation = (ev: string, turn: string) => {
        if (ev.startsWith("M")) {
            ev = `M${ev.substring(1)}`;
        }
        if (turn === "b" && !ev.startsWith("M")) {
            if (ev.startsWith("-")) {
                ev = ev.substring(1);
            } else {
                ev = `-${ev}`;
            }
        }
        return ev;
    };
}

function Stockfish({ fen, depth }: { fen: string; depth: number }) {
    const stockfishRef = useRef<Engine | null>(null);
    const [evals, setEvals] = useState<string>("0.0");
    const [eData, setEdata] = useState<Array<string>>([]);
    const [heightDef, setHeightDef] = useState<number>(50);

    useEffect(() => {
        const stockfish = stockfishRef.current ?? new Engine(fen, depth);
        // Clear edata array for next evaluation
        setEdata([]);

        // Run classical evaluation with Stockfish 15
        stockfish.engine.postMessage("uci");
        stockfish.engine.postMessage("ucinewgame");
        stockfish.engine.postMessage(`position fen ${fen}`);
        stockfish.engine.postMessage(`go depth ${depth}`);

        // Use a debounce timeout to prevent the eval from updating rapidly
        let debounceTimeout: ReturnType<typeof setTimeout>;

        const updateEval = (event: MessageEvent) => {
            setEdata((eData) => [...eData, event.data]);
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                // Check for changes in stockfish.eval
                if (stockfish.eval !== event.data) {
                    // Do not set evals if the stockfish.eval value is 'info' meaning that there is no evaluation ready
                    // This happens in higher depth analysis above 20, where it takes a lot of computing power to execute
                    if (stockfish.eval !== "info") setEvals(stockfish.eval);
                    // Don't set the eval height if it is NaN, we cannot translate it and it usually only comes up when it is M0 (checkmate)
                    if (!isNaN(stockfish.evalBarHeight)) setHeightDef(stockfish.evalBarHeight);
                }
            }, 500);
        };
        stockfish.engine.addEventListener("message", updateEval);

        return () => {
            clearTimeout(debounceTimeout);
            stockfish.engine.removeEventListener("message", updateEval);
            stockfish.engine.terminate();
        };
    }, [fen, depth]);

    return (
        <>
            <div id="evalbar">
                <div
                    style={{
                        height: "98%",
                        width: "3%",
                        backgroundColor: "white",
                        position: "absolute",
                        zIndex: "-1",
                        borderRadius: "10px",
                    }}
                />
                <div
                    style={{
                        height: heightDef + "%",
                        width: "3vw",
                        backgroundColor: "#1a1a1a",
                        transition: "height 1s",
                        borderRadius: "8px 8px 0 0",
                    }}
                />
                <div
                    style={{
                        transform: `translate(25%, ${heightDef}%)`,
                        transition: "transform 1s",
                        textAlign: "center",
                        fontWeight: "bold",
                        display:
                            evals.startsWith("M") || evals.startsWith("1-") || evals.startsWith("0-")
                                ? "none"
                                : "block",
                    }}
                >
                    {evals}
                </div>
                <p
                    style={{
                        transform: `translate(25%, ${heightDef > 50 ? -51 : 46}vh)`,
                        transition: "transform 1s, display 1s",
                        textAlign: "center",
                        fontWeight: "bold",
                        display:
                            evals.startsWith("M") || evals.startsWith("1-") || evals.startsWith("0-")
                                ? "block"
                                : "none",
                        color: heightDef > 50 ? "white" : "black",
                    }}
                >
                    {evals}
                </p>
            </div>
            <p id="stockfish">
                {evals}, {eData}
            </p>
        </>
    );
}

export default Stockfish;
