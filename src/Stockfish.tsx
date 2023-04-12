/**
 * Stockfish compatibility module for displaying current evaluation status information.
 * Compatible with FEN strings only. Limitations include FusionChess's dual board nature.
 * @author Lucas Bubner, 2023
 */
import { useEffect, useRef, useState, Fragment, createRef } from "react";

class Engine {
    engine: Worker;
    fusionengine: Worker;
    eval: string[];
    fen: string[] = ["", ""];
    depth: number;
    evalBarHeight: number;

    constructor(fen: string, vfen: string, depth: number) {
        this.engine = new Worker("/stockfish.js");
        this.fusionengine = new Worker("/stockfish.js");
        this.eval = ["0.0", "0.0"];
        this.fen[0] = fen;
        this.fen[1] = vfen;
        this.depth = depth;
        this.engine.onmessage = (e) => this.onStockfishMessage(e, this.fen, "e");
        this.fusionengine.onmessage = (e) => this.onStockfishMessage(e, this.fen, "v")
        this.evalBarHeight = 50;
    }

    onStockfishMessage = (event: MessageEvent, fen: string[], engine: string) => {
        // console.debug(`SF15: ${event.data}`);
        if (event.data.startsWith("info depth")) {
            let messageEvalType;
            const message = event.data.split(" ");
            // Determine the current turn from the FEN, should be the same
            let turn;
            if (engine === "e") {
                turn = fen[0].split(" ")[1];
            } else {
                turn = fen[1].split(" ")[1];
            }

            if (message.includes("mate")) {
                messageEvalType = `M${message[message.indexOf("mate") + 1]}`;
            } else {
                messageEvalType = message[message.indexOf("cp") + 1];
            }

            const evaluation = this._convertEvaluation(String(messageEvalType / 100.0), turn);
            // Check if the eval is NaN
            if (evaluation.includes("NaN")) {
                // Must be a M value
                if (messageEvalType === "M0") {
                    messageEvalType = turn === "w" ? "0-1" : "1-0";
                }
                if (engine === "e") {
                    this.eval[0] = evaluation;
                } else {
                    this.eval[1] = evaluation;
                }
            } else {
                if (engine === "e") {
                    this.eval[0] = evaluation;
                } else {
                    this.eval[1] = evaluation;
                }
            }

            let heightEval: number;
            const choseneval = this._chooseAppropriateEval();
            if (messageEvalType.startsWith("M")) {
                // Is checkmate in X, fill the whole bar depending on which side is winning
                heightEval = !choseneval.includes("-") && turn === "b" ? 100 : 0;
            } else {
                heightEval = choseneval.startsWith("-")
                    ? 50 + this._calcHeight(Math.abs(Number(choseneval)))
                    : 50 - this._calcHeight(Math.abs(Number(choseneval)));
            }
            this.evalBarHeight = heightEval;
        }
    };

    private _chooseAppropriateEval() {
        return this.eval[0];
    }

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

function Stockfish({ fen, vfen, depth }: { fen: string | null; vfen: string | null; depth: number }) {
    const stockfishRef = useRef<Engine | null>(null);
    const [evals, setEvals] = useState<string>("0.0");
    const [eData, setEdata] = useState<Array<string>>([]);
    const [heightDef, setHeightDef] = useState<number>(75);

    useEffect(() => {
        if (!fen) {
            setEdata(["Setting up Stockfish 15..."]);
            const reqs = [new XMLHttpRequest(), new XMLHttpRequest()];
            reqs[0].open("HEAD", "/stockfish.js", false);
            reqs[1].open("HEAD", "/stockfish.wasm", false);
            reqs.forEach((req) => req.send());

            if (reqs[0].status === 404) {
                setEdata((eData) => [...eData, "Could not find stockfish.js file."]);
            } else {
                setEdata((eData) => [...eData, "Found stockfish.js."]);
            }

            if (reqs[1].status === 404) {
                setEdata((eData) => [...eData, "Could not find WebAssembly binary."]);
            } else {
                setEdata((eData) => [...eData, "Found WebAssembly binary."]);
            }

            if (reqs[0].status === 404 || reqs[1].status === 404) {
                setEdata((eData) => [...eData, "Error: Unable to configure."]);
                setEvals("⌀");
            } else {
                setEdata((eData) => [...eData, "Stockfish 15 is ready."]);
                setEvals("0.0");
            }
            
            setHeightDef(50);
            return;
        }

        const stockfish = stockfishRef.current ?? new Engine(fen, vfen, depth);
        // Clear edata array for next evaluation
        if (!eData.includes("Error: Unable to configure."))
            setEdata([]);

        // Run classical evaluation with Stockfish 15
        stockfish.engine.postMessage("uci");
        stockfish.engine.postMessage("ucinewgame");
        stockfish.engine.postMessage(`position fen ${stockfish.fen[0]}`);
        stockfish.engine.postMessage(`go depth ${depth}`);

        // Do we have anything on the virtual board? Check the differences and if they are
        // then run an evaluation on the virtual board
        if (stockfish.fen[0] !== stockfish.fen[1]) {
            stockfish.fusionengine.postMessage("uci");
            stockfish.fusionengine.postMessage("ucinewgane");
            stockfish.fusionengine.postMessage(`position fen ${stockfish.fen[1]}`);
            stockfish.fusionengine.postMessage(`go depth ${depth}`);
        }

        // Use a debounce timeout to prevent the eval from updating rapidly
        let debounceTimeout: ReturnType<typeof setTimeout>;

        const updateEval = (event: MessageEvent) => {
            setEdata((eData) => [
                ...eData,
                `[${new Date(Date.now()).toLocaleString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                })}] ${event.data}`,
            ]);
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                // Check for changes in stockfish.eval
                if (stockfish.eval[0] !== event.data) {
                    // Do not set evals if the stockfish.eval value is 'info' meaning that there is no evaluation ready
                    // This happens in higher depth analysis above 20, where it takes a lot of computing power to execute
                    if (stockfish.eval[0] !== "info") setEvals(stockfish.eval[0]);
                    // Don't set the eval height if it is NaN, we cannot translate it and it usually only comes up when it is M0 (checkmate)
                    if (!isNaN(stockfish.evalBarHeight)) setHeightDef(stockfish.evalBarHeight);
                }
            }, 500);
        };
        stockfish.engine.addEventListener("message", updateEval);
        stockfish.fusionengine.addEventListener("message", updateEval);

        return () => {
            clearTimeout(debounceTimeout);
            stockfish.engine.removeEventListener("message", updateEval);
            stockfish.engine.terminate();
            stockfish.fusionengine.terminate();
        };
    }, [fen, depth]);

    // Config dummy to always be in view
    const dummy = createRef<HTMLDivElement>();

    useEffect(() => {
        if (window.innerWidth > 1270)
            dummy.current?.scrollIntoView({ behavior: "auto" });
    }, [eData]);
    
    function bestMove() {
        if (eData && eData.length > 0) {
            const lastLine = eData[eData.length - 1];
            let bestMove = null;
            if (lastLine.includes("bestmove")) {
                bestMove = lastLine.split("bestmove ")[1].split(" ")[0];
            }
            return bestMove;
        }
    }

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
                        transform: "translateX(-125%)"
                    }}
                />
                <div
                    style={{
                        height: heightDef + "%",
                        width: "3.1vw",
                        backgroundColor: "#1a1a1a",
                        transition: "height 1s",
                        zIndex: "-1",
                        borderRadius: "8px 8px 0 0",
                        transform: "translateX(-121%)"
                    }}
                />
                <div
                    style={{
                        transform: `translate(-160%, ${heightDef}%)`,
                        transition: "transform 1s",
                        textAlign: "center",
                        zIndex: "-1",
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
                        transform: `translate(-160%, ${heightDef > 50 ? -51 : 46}vh)`,
                        transition: "transform 1s, display 1s",
                        textAlign: "center",
                        fontWeight: "bold",
                        zIndex: "-1",
                        display:
                            evals.startsWith("M") || evals.startsWith("1-") || evals.startsWith("0-")
                                ? "block"
                                : "none",
                        color: heightDef > 50 ? "white" : "black",
                    }}
                >
                    {evals.startsWith("M") ? evals.replace("-", "") : evals}
                </p>
            </div>
            <div id="stockfish" style={{ textAlign: "center" }}>
                <p className="title">Stockfish 15</p>
                Classical analysis <br />
                Current engine evaluation: {evals.startsWith("M") ? evals.replace("-", "") : evals} <br />
                Top engine move: {bestMove() ?? "⌀"} <br />
                Max depth=19 <br /> <br />
                <div
                    style={{
                        fontFamily: "Lucida Console, sans-serif",
                        border: "2px solid grey",
                        padding: "12px",
                        textAlign: "left",
                        minHeight: "60vh",
                        maxHeight: "60vh",
                        overflowY: "scroll",
                        whiteSpace: "nowrap",
                        background: "#000",
                    }}
                >
                    {eData.map((d, i) => (
                        <Fragment key={i}>
                            {d} <br />
                        </Fragment>
                    ))}
                    <div id="dummy" ref={dummy} />
                </div>
            </div>
        </>
    );
}

export default Stockfish;
