import { useState, useEffect, useMemo } from "react";
import { Chess, Square } from "chess.js/src/chess";
import { Chessboard } from "react-chessboard";
import "./App.css";

function App() {
    const [game, setGame] = useState(new Chess());
    const [fen, setFen] = useState(game.fen());
    const [sounds, setSounds] = useState<HTMLAudioElement[]>([]);
    const [squareAttributes, setSquareAttributes] = useState<{ [key: string]: { backgroundColor: string } }>({});
    const [msgAlert, setMsgAlert] = useState("");
    const [boardWidth, setBoardWidth] = useState<number>(
        Math.min(document.documentElement.clientHeight, document.documentElement.clientWidth) - 15
    );

    // Get all audio files and store them in an state array
    useMemo(() => {
        setSounds([
            new Audio("./src/assets/checkmate.mp3"),
            new Audio("./src/assets/check.mp3"),
            new Audio("./src/assets/draw.mp3"),
            new Audio("./src/assets/capture.mp3"),
            new Audio("./src/assets/move.mp3"),
        ]);
        sounds.forEach((sound) => {
            sound.load();
        });
    }, []);

    // Force a rerender if the screen dimensions change
    useEffect(() => {
        const handleResize = () => {
            setBoardWidth(Math.min(document.documentElement.clientHeight, document.documentElement.clientWidth) - 15);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    function importFen() {
        const fen = prompt("Enter FEN: ");
        if (fen == null) return;
        try {
            game.load(fen);
        } catch (e) {
            alert("Invalid FEN!");
            return;
        }
        setFen(fen);
    }

    // Get the square from a move position, extracting the last two characters for a board position
    function getPosition(square: string) {
        if (square.slice(-1) == "+" || square.slice(-1) == "#") {
            return square.slice(-3).substring(0, 2);
        }
        return square.slice(-2);
    }

    function onDrop(sourceSquare: Square, targetSquare: Square) {
        // Don't move if the game is over
        if (game.isGameOver()) return false;

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        if (game.get(targetSquare) != false) {
            // Must be capturing a piece, activate fusion
        }

        const copy = game;
        try {
            const move = copy.move({
                from: sourceSquare,
                to: targetSquare,
                promotion: "q",
            });
            // Play sounds depending on the event
            if (copy.isCheckmate()) {
                sounds[0].play();
            } else if (copy.isCheck()) {
                sounds[1].play();
            } else if (copy.isDraw()) {
                sounds[2].play();
            } else if (move.captured) {
                sounds[3].play();
            } else {
                sounds[4].play();
            }
        } catch (Error) {
            return false;
        }
        setGame(copy);
        // Trigger a re-render by updating fen state, as updating object will not trigger it
        setFen(copy.fen());
        return true;
    }

    function onHover(square: Square) {
        onHoverLeave(square);
        const moves = game.moves({ square: square });
        let edits = {};
        for (let i = 0; i < moves.length; i++) {
            // Assign edits to a variable to avoid re-rendering for each move
            edits = {
                ...edits,
                [getPosition(moves[i])]: {
                    backgroundColor: "rgba(255, 0, 0, 0.5)",
                },
            };
        }
        // Highlight squares by updating the styles board state
        setSquareAttributes(edits);
    }

    function onHoverLeave(square: Square) {
        const moves = game.moves({ square: square });
        for (let i = 0; i < moves.length; i++) {
            // Remove highlighting by updating the styles board state
            setSquareAttributes({
                [getPosition(moves[i])]: {
                    backgroundColor: "revert",
                },
            });
        }
    }

    useEffect(() => {
        // Handle game conditions
        if (game.isCheckmate()) {
            setMsgAlert("Checkmate!");
        } else if (game.isStalemate()) {
            setMsgAlert("Draw! Stalemate!");
        } else if (game.isThreefoldRepetition()) {
            setMsgAlert("Draw! Threefold Repetition!");
        } else if (game.isInsufficientMaterial()) {
            setMsgAlert("Draw! Insufficient Material!");
        } else if (game.isCheck()) {
            setMsgAlert("Check!");
        } else {
            setMsgAlert("");
        }
    }, [fen]);

    return (
        <div className="container">
            <img src="/cdotcom.png" id="bg" />
            <div className="board">
                <Chessboard
                    position={fen}
                    onPieceDrop={onDrop}
                    id="board"
                    boardWidth={boardWidth}
                    onMouseOverSquare={onHover}
                    onMouseOutSquare={onHoverLeave}
                    customSquareStyles={squareAttributes}
                />
            </div>
            <div className="left">
                <h1 className="title">Fusion Chess</h1>
                <button
                    id="reset"
                    onClick={() => {
                        if (!window.confirm("Confirm reset?")) return;
                        game.reset();
                        setFen(game.fen());
                    }}
                >
                    Reset
                </button>
                <button
                    id="undo"
                    onClick={() => {
                        game.undo();
                        setFen(game.fen());
                    }}
                >
                    Undo
                </button>
                <br />
                <button
                    id="copy"
                    onClick={() => {
                        navigator.clipboard.writeText(fen);
                        alert(`copied fen: ${fen}`);
                    }}
                >
                    Copy FEN
                </button>
                <button id="import" onClick={importFen}>
                    Import FEN
                </button>
                <p id="alert" className="center">
                    {msgAlert}
                </p>
            </div>
            <div className="bottom">
                <p className="title">History</p>
                <p className="history">
                    {game.history().length > 0 ? (
                        game.history().map((move, index) => {
                            return (
                                <>
                                    {index % 2 === 0 ? index / 2 + 1 + "." : null}
                                    {move}{" "}
                                </>
                            );
                        })
                    ) : (
                        <>No moves have been made.</>
                    )}
                </p>
            </div>
        </div>
    );
}

export default App;
