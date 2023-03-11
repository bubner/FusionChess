import { useState, useEffect } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import "./App.css";

function App() {
    const [game, setGame] = useState(new Chess());
    const [fen, setFen] = useState(game.fen());
    const [boardWidth, setBoardWidth] = useState(window.innerHeight - 100);

    // Force a rerender if the screen dimensions change
    useEffect(() => {
        const handleResize = () => {
            setBoardWidth(window.innerHeight - 100);
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
        setBoardWidth(window.innerHeight - 100);
        return true;
    }

    return (
        <div className="App">
            <div id="board">
                <Chessboard position={fen} onPieceDrop={onDrop} id="board" boardWidth={boardWidth} />
            </div>
        </div>
    );
}

export default App;
