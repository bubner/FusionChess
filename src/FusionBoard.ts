import { Chess, Square, PieceSymbol, SQUARES } from "chess.js/src/chess";

/**
 * Fusion chess board implementation
 * @author Lucas Bubner, 2023
 */
export default class FusionBoard extends Chess {
    // Extending from the Chess class allows us to use the same implementation mechanics of normal chess
    // This allows us to use the same movePiece function and other functions that are already implemented

    #fused: Record<string, PieceSymbol>;
    #fused_history: Array<Record<Square, PieceSymbol>>;
    #virtual_board: Chess;

    constructor() {
        super();
        // Initialise an empty fused board positions
        this.#fused = {};
        // Initialise an empty fused board history
        this.#fused_history = [];
        // Initialise a virtual board to check for valid moves
        this.#virtual_board = new Chess();
    }

    movePiece(movefrom: Square, moveto: Square) {
        // Get the target square of the move
        const targetsquare = this.get(moveto);
        // Move on the primary board and return the result
        try {
            const move = this.move({
                from: movefrom,
                to: moveto,
                promotion: "q",
            });

            // Check if the move was a capture, if so, get the type piece on that square
            if (targetsquare) {
                // If it is already fused, then delete it from the fused board
                if (this.#fused[moveto]) {
                    delete this.#fused[moveto];
                }
                if (this.#fused[movefrom]) {
                    delete this.#fused[movefrom];
                }
                // Add the captured piece to the fused board
                this.#fused[moveto] = targetsquare.type;
            }

            // Update movement of any pieces that have been fused
            for (const [square, piece] of Object.entries(this.#fused)) {
                // Check if the piece is on the same square as the move
                if (square === movefrom) {
                    // Remove the piece from the fused board
                    delete this.#fused[square];
                    // Add the piece to the new square
                    this.#fused[moveto] = piece;
                }
            }

            // Update history by deep copying the current fused board
            this.#fused_history.push(JSON.parse(JSON.stringify(this.#fused)));

            // Return to the primary board after fusion procedure has completed
            return move;
        } catch (e) {
            // If the move was allegedly invalid, then try again but on a virtual board
            this.#virtual_board.load(this.fen());
            // Edit the virtual board to reflect the current fused pieces
            for (const [square, piece] of Object.entries(this.#fused)) {
                this.#virtual_board.put({ type: piece, color: this.get(<Square> square).color }, <Square> square);
            }
            // Try to move on the virtual board
            try {
                const move = this.#virtual_board.move({
                    from: movefrom,
                    to: moveto,
                    promotion: "q",
                });
                // If the move is valid, then continue the move forcefully
                if (move) {
                    // Check if the move related to the king
                    if (move.piece === "k") {
                        // If so, be careful
                        return false;
                    }
                    // Make a copy of the primary board
                    const copy = new Chess(this.fen());
                    // Update FEN of the primary board to reflect the virtual board
                    this.load(this.#virtual_board.fen());
                    // Remove the piece from the primary board
                    this.remove(movefrom);
                    // Change the piece identifier to the inverse, as they will be replaced
                    this.#fused[movefrom] = copy.get(movefrom).type;
                    // Update movement of any pieces that have been fused
                    for (const [square, piece] of Object.entries(this.#fused)) {
                        // Check if the piece is on the same square as the move
                        if (square === movefrom) {
                            // Remove the piece from the fused board
                            delete this.#fused[square];
                            // Add the piece to the new square
                            this.#fused[moveto] = piece;
                        }
                    }
                }
                return move;
            } catch (e) {
                // If the move is still invalid, then return false
                return false;
            }
        }
    }

    get positions(): [string, Record<string, string>] {
        return [this.fen(), this.#fused];
    }

    reset() {
        super.reset();
        this.#fused = {}
        this.#fused_history = [];
    }

    undo() {
        // Change the current state to the previous one in the history
        const undoAction = super.undo();
        if (!undoAction)
            return undoAction;

        // Undo any fused pieces that were attained in the previous move
        this.#fused_history.pop();
        this.#fused = this.#fused_history[-1];

        return undoAction;
    }

    getFusedMoves(fused: Array<string>, hovering: string, fen: string): string[] {
        this._updateVirtualBoard();
        // Get the moves for the current fused pieces
        const moves = this.#virtual_board.moves({ verbose: true });
        // Filter the moves to only include the moves that are valid for the current fused pieces
        const filteredMoves = moves.filter((move) => {
            // Check if the move is a capture
            if (move.captured) {
                // Check if the captured piece is in the fused pieces
                if (fused.includes(move.captured)) {
                    // Check if the piece is not the piece that is currently being hovered
                    if (move.captured !== hovering) {
                        // If the piece is not the piece that is currently being hovered, then the move is valid
                        return true;
                    }
                }
            }
            // If the move is not a capture, then it is valid
            return true;
        }
        );
        // Return the filtered moves
        return filteredMoves.map((move) => move.from + move.to);
    }

    private _updateVirtualBoard() {
        // Update the virtual board to reflect the current fused pieces
        this.#virtual_board.load(this.fen());
        for (const [square, piece] of Object.entries(this.#fused)) {
            this.#virtual_board.put({ type: piece, color: this.get(<Square> square).color }, <Square> square);
        }
    }

    isCheckmate() {
        this._updateVirtualBoard();
        return super.isCheckmate() || (this.#virtual_board.isCheck() && this.moves({ square: this.findKing()!! }).length === 0);
    }

    findKing(): Square | null {
        for (const square of SQUARES) {
            const piece = this.get(square);
            if (piece && piece.type === "k" && piece.color === this.turn()) {
                return <Square> square;
            }
        }
        return null;
    }

    isStalemate() {
        this._updateVirtualBoard();
        return super.isStalemate() && (!this.#virtual_board.isCheck() && this.moves({ square: this.findKing()!! }).length === 0);
    }

    isCheck() {
        this._updateVirtualBoard();
        // Strange bug with detection due to the virtual board turn not being updated
        return super.isCheck() || this.#virtual_board.isCheck();
    }
}