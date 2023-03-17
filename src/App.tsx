import { useState, useEffect } from "react";
import { Chess, Square } from "chess.js/src/chess";
import { Chessboard } from "react-chessboard";
import "./App.css";

function App() {
    const [game, setGame] = useState(new Chess());
    const [fen, setFen] = useState(game.fen());
    const [msgAlert, setMsgAlert] = useState("");
    const [boardWidth, setBoardWidth] = useState<number>(600);

    // Force a rerender if the screen dimensions change
    useEffect(() => {
        const handleResize = () => {
            setBoardWidth(600);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    function onDrop(sourceSquare: Square, targetSquare: Square) {
        let copy = game;
        try {
            copy.move({
                from: sourceSquare,
                to: targetSquare,
                promotion: "q",
            });
        } catch (Error) {
            return false;
        }
        setGame(copy);
        // Trigger a re-render by updating fen state, as updating object will not trigger it
        setFen(copy.fen());
        return true;
    }

    useEffect(() => {
        // Handle win conditions
        if (game.isCheckmate()) {
            setMsgAlert("Checkmate!");
        } else if (game.isDraw()) {
            setMsgAlert("Draw!");
        } else if (game.isStalemate()) {
            setMsgAlert("Stalemate!");
        } else if (game.isThreefoldRepetition()) {
            setMsgAlert("Draw! Threefold Repetition!");
        } else if (game.isInsufficientMaterial()) {
            setMsgAlert("Draw! Insufficient Material!");
        } else {
            setMsgAlert("");
        }
    }, [fen]);

    return (
        <div className="container">
            <div className="board">
                <Chessboard position={fen} onPieceDrop={onDrop} id="board" boardWidth={boardWidth} />
            </div>
            <div className="half">
                <p className="info">
                    {game.history().map((move, index) => {
                        return (
                            <>
                                {index % 2 == 0 ? index / 2 + 1 + "." : null}{move}{" "}
                            </>
                        );
                    })}
                </p>
                <h1 className="center" id="title">
                    Fusion Chess
                </h1>
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
                <p id="alert" className="center">
                    {msgAlert}
                </p>
            </div>
        </div>
    );
}

export default App;
