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

    constructor(fen: string, depth: number) {
        this.engine = new Worker("/stockfish.js");
        this.eval = "0.0";
        this.fen = fen;
        this.depth = depth;
        this.engine.onmessage = (event) => this.onStockfishMessage(event, this.fen);
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
            } else {
                this.eval = evaluation;
            }
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

    useEffect(() => {
        const stockfish = stockfishRef.current ?? new Engine(fen, depth);
        stockfish.engine.postMessage("uci");
        stockfish.engine.postMessage("ucinewgame");
        stockfish.engine.postMessage(`position fen ${fen}`);
        stockfish.engine.postMessage(`go depth ${depth}`);

        // Use a debounce timeout to prevent the eval from updating rapidly
        let debounceTimeout: ReturnType<typeof setTimeout>;

        const updateEval = (event: MessageEvent) => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                // Check for changes in stockfish.eval
                if (stockfish.eval !== event.data) {
                    setEvals(stockfish.eval);
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
        <div>
            <p style={{color: "white"}}>stockfish: {evals}</p>
        </div>
    );
}

export default Stockfish;
