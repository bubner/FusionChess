import { useState, useEffect, useMemo } from "react";
import { Square } from "chess.js/src/chess";
import FusionBoard from "./FusionBoard";
import { Chessboard } from "react-chessboard";
import Stockfish from "./Stockfish";
import "./App.css";

function App() {
    const [game] = useState(new FusionBoard());
    const [isClicked, setIsClicked] = useState<Square | null>(null);
    const [fen, setFen] = useState(game.positions[0]);
    const [isGameStarted, setIsGameStarted] = useState<boolean>(false);
    const [sounds, setSounds] = useState<HTMLAudioElement[]>([]);
    const [squareAttributes, setSquareAttributes] = useState<{ [key: string]: { backgroundColor: string } }>({});
    const [msgAlert, setMsgAlert] = useState("");
    const [boardWidth, setBoardWidth] = useState<number>(
        Math.max(400, Math.min(document.documentElement.clientHeight, document.documentElement.clientWidth) - 15)
    );

    // Get all audio files and store them in a state array
    useMemo(() => {
        setSounds([
            new Audio("./src/assets/checkmate.mp3"),
            new Audio("./src/assets/check.mp3"),
            new Audio("./src/assets/draw.mp3"),
            new Audio("./src/assets/capture.mp3"),
            new Audio("./src/assets/castle.mp3"),
            new Audio("./src/assets/move.mp3"),
        ]);
        sounds.forEach((sound) => {
            sound.load();
        });
    }, []);

    // Force a rerender if the screen dimensions change
    useEffect(() => {
        const handleResize = () => {
            setBoardWidth(
                Math.max(
                    400,
                    Math.min(document.documentElement.clientHeight, document.documentElement.clientWidth) - 15
                )
            );
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

    function onDrop(sourceSquare: Square, targetSquare: Square) {
        // Don't move if the game is over
        if (game.isGameOver() || !isGameStarted) return false;
        setIsClicked(null);
        try {
            const move = game.movePiece(sourceSquare, targetSquare);
            if (move === false) {
                return false;
            }
            // Play sounds depending on the event
            if (game.isCheckmate()) {
                sounds[0].play();
            } else if (game.isCheck()) {
                sounds[1].play();
            } else if (game.isDraw()) {
                sounds[2].play();
            } else if (typeof move !== "boolean" && move?.captured) {
                sounds[3].play();
            } else if (move.san === "O-O" || move.san === "O-O-O") {
                sounds[4].play();
            } else {
                sounds[5].play();
            }
            // Clear board from highlighting
            setSquareAttributes({});
        } catch (Error) {
            return false;
        }
        // Trigger a re-render by updating fen state, as updating object will not trigger it
        setFen(game.fen());
        return true;
    }

    function onClick(square: Square) {
        if (game.isGameOver() || !isGameStarted) return;
        onHover(square);
        if (isClicked && square !== isClicked) {
            // Must be trying to make a move on the board
            onDrop(isClicked, square);
            for (const key in squareAttributes) {
                if (key !== square) {
                    // Reset all square attributes to default
                    squareAttributes[key] = {
                        backgroundColor: "revert",
                    };
                }
            }
            setIsClicked(null);
        } else {
            if (!game.get(square) || game.get(square).color !== game.turn()) return;
            setIsClicked(square);
            setSquareAttributes({
                ...squareAttributes,
                [square]: {
                    backgroundColor: "rgba(0, 255, 0, 0.5)",
                },
            });
        }
    }

    function onHover(square: Square) {
        if (game.isGameOver() || isClicked || !isGameStarted) return;
        onHoverLeave(square);
        const moves = game.moves({ square: square, verbose: true });
        let edits = {};
        for (let i = 0; i < moves.length; i++) {
            // Assign edits to a variable to avoid re-rendering for each move
            edits = {
                ...edits,
                [moves[i].to]: {
                    backgroundColor: "rgba(255, 0, 0, 0.5)",
                },
            };
        }
        // Check if the current square has a fused piece on it
        const fused = Object.entries(game.positions[1]).find((piece) => piece[0] === square);
        if (fused) {
            // If it does, highlight the additional moves of the fused piece
            const moves = game.getFusedMoves(fused, square);
            for (let i = 0; i < moves.length; i++) {
                // Ensure to only assign moves that we are hovering, and to ensure it is our turn
                if (moves[i].includes(square) && game.turn() === game.get(square).color) {
                    edits = {
                        ...edits,
                        [moves[i].slice(-2)]: {
                            backgroundColor: "rgba(255, 0, 0, 0.5)",
                        },
                    };
                }
            }
        }
        // Highlight squares by updating the styles board state
        setSquareAttributes(edits);
    }

    function onHoverLeave(square: Square) {
        if (isClicked === square || !isGameStarted) return;
        const moves = game.moves({ square: square, verbose: true });
        for (let i = 0; i < moves.length; i++) {
            // Remove highlighting by updating the styles board state
            setSquareAttributes({
                ...squareAttributes,
                [moves[i].to]: {
                    backgroundColor: "revert",
                },
            });
        }
    }

    function start() {
        new Audio("./src/assets/start.mp3").play();
        setIsGameStarted(true);
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
            <img src="/cdotcom.png" id="bg" alt="Background" />
            <div className="board">
                <Chessboard
                    position={fen}
                    onPieceDrop={onDrop}
                    onSquareClick={onClick}
                    id="board"
                    boardWidth={boardWidth}
                    onMouseOverSquare={onHover}
                    onMouseOutSquare={onHoverLeave}
                    customSquareStyles={squareAttributes}
                />
            </div>
            <div className="left">
                <h1 className="title">Fusion Chess</h1>
                <h3 style={{ color: "white" }}>Lucas Bubner, 2023</h3>
                <button
                    id="reset"
                    onClick={() => {
                        if (!window.confirm("Confirm reset?")) return;
                        game.reset();
                        setFen(game.fen());
                        setIsClicked(null);
                        setSquareAttributes({});
                        setIsGameStarted(false);
                    }}
                >
                    Reset
                </button>
                <button
                    id="undo"
                    onClick={() => {
                        game.undo();
                        setFen(game.fen());
                        setIsClicked(null);
                    }}
                >
                    Undo
                </button>
                <br />
                <button
                    id="copy"
                    onClick={() => {
                        navigator.clipboard.writeText(fen);
                        alert(`copied: ${fen}`);
                    }}
                >
                    Copy
                </button>
                <button id="import" onClick={importFen}>
                    Import
                </button>{" "}
                <br />
                <button
                    id="start"
                    style={{ border: "2px solid lightgreen", display: isGameStarted ? "none" : "revert", backgroundColor: "green" }}
                    onClick={start}
                >
                    Start
                </button>
                <p id="alert" className="center">
                    {msgAlert}
                </p>
            </div>
            <div className="middle">
                <p className="title">Fused</p>
                <p className="history">
                    {game.positions[1] && Object.keys(game.positions[1]).length > 0 ? (
                        Object.entries(game.positions[1]).map((position, index) => {
                            return (
                                <>
                                    {index + 1}. {position.slice(0, 1)}={position.slice(-1).toString().substring(1)}
                                    {position.slice(-1).toString().substring(0, 1).toUpperCase()}{" "}
                                </>
                            );
                        })
                    ) : (
                        <>No pieces have been fused.</>
                    )}
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
            <Stockfish fen={isGameStarted ? fen : null} vfen={isGameStarted ? game.positions[2] : null} depth={19} />
        </div>
    );
}

export default App;
