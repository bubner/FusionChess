import { Chess, Square, PieceSymbol, Move, Color, SQUARES } from "chess.js/src/chess";
/**
 * Fusion chess board implementation
 * @author Lucas Bubner, 2023
 */
export default class FusionBoard extends Chess {
    // Extending from the Chess class allows us to use the same implementation mechanics of normal chess
    // This allows us to use the same movePiece function and other functions that are already implemented

    #fused: Record<string, string>;
    #king_fused: Record<string, string>;
    #virtual_board: Chess;

    constructor() {
        super();
        // Initialise an empty fused board positions
        this.#fused = {};
        this.#king_fused = {};
        // Initialise a virtual board to check for valid moves
        this.#virtual_board = new Chess();
    }

    movePiece(movefrom: Square, moveto: Square): Move | false {
        // Get the target square of the move
        const targetsquare = this.get(moveto);
        const sourcesquare = this.get(movefrom);
        this._updateVirtualBoard();
        const vTargetSquare = this.#virtual_board.get(moveto);
        const vSourceSquare = this.#virtual_board.get(movefrom);
        if (this._willJeopardiseKing(movefrom, moveto)) {
            return false;
        }

        const updateMovement = () => {
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
            this._updateVirtualBoard();
        };

        const sourcePieceIs = (identifier: string) => {
            return sourcesquare.type === identifier || vSourceSquare.type === identifier;
        };

        const targetPieceIs = (identifier: string) => {
            return targetsquare.type === identifier || vTargetSquare.type === identifier;
        };

        // Move on the primary board and return the result
        try {
            const move = this.move({
                from: movefrom,
                to: moveto,
                promotion: "q",
            });

            // Check if the move was a capture, if so, get the type piece on that square
            if (targetsquare) {
                // Do not fuse pieces of the same type or movement
                if (
                    sourcesquare.type === targetsquare.type ||
                    vSourceSquare.type === vTargetSquare.type ||
                    (sourcePieceIs("q") && (targetPieceIs("r") || targetPieceIs("b") || targetPieceIs("p")))
                ) {
                    updateMovement();
                    return move;
                }

                // Special fusion on rook and bishop
                if ((sourcePieceIs("r") && targetPieceIs("b")) || (sourcePieceIs("b") && targetPieceIs("r"))) {
                    // Remove fusion
                    delete this.#fused[movefrom];
                    delete this.#fused[moveto];
                    // Undo the move as we need to make it a queen first
                    this.undo();
                    // Replace source square with queen
                    this.put({ type: "q", color: sourcesquare.color }, movefrom);
                    // Make the move again
                    return this.move({
                        from: movefrom,
                        to: moveto,
                        promotion: "q",
                    });
                }

                // Special logic for king fusion, as we cannot replace the kings on the board
                if (sourcesquare.type === "k") {
                    // Do not fuse with pawns, and if we have a queen, don't fuse with anything
                    // Knight-queen-king is not possible to obtain as it would be impossible to checkmate, and the virtual board cannot support two fusions.
                    if (targetPieceIs("p") || this.#king_fused[sourcesquare.color + "K"] === "q") {
                        updateMovement();
                        return move;
                    }
                    // Assign special fusion to the king
                    this.#king_fused[sourcesquare.color + "K"] = targetsquare.type;
                    delete this.#fused[moveto];
                    return move;
                }

                // If it is already fused, then delete it from the fused board
                if (this.#fused[moveto]) {
                    delete this.#fused[moveto];
                }
                if (this.#fused[movefrom]) {
                    delete this.#fused[movefrom];
                }

                updateMovement();
                // Add the captured piece to the fused board
                this.#fused[moveto] = targetsquare.type;
            }

            // Return to the primary board after fusion procedure has completed
            updateMovement();
            return move;
        } catch (e) {
            try {
                // Move is allegedly illegal, but the virtual board will not account for a fused king (due to the king being replaced)
                // This is a special case movement, meaning we have to run manual calculations. We run these before the actual virtual board calculations.
                if (sourcesquare.type === "k") {
                    // Check if the target square is under attack
                    if (this.isAttacked(moveto, this.turn() === "w" ? "b" : "w")) {
                        return false;
                    }

                    const copy = new Chess(this.fen());
                    // Force replace the king on the board
                    copy.remove(movefrom);
                    copy.put(
                        { type: this.#king_fused[sourcesquare.color + "K"] as PieceSymbol, color: sourcesquare.color },
                        movefrom
                    );

                    // Make movement with new piece
                    let move: Move | boolean = false;
                    try {
                        move = copy.move({
                            from: movefrom,
                            to: moveto,
                            promotion: "q",
                        });
                    } catch (e) {
                        // Invalid move
                        return false;
                    }
                    if (!move) return false;

                    // Force move on primary board by teleporting the king
                    this.remove(movefrom);
                    // King fused piece position will update automatically
                    this.put({ type: "k", color: sourcesquare.color }, moveto);

                    // Force change the turn
                    const fen = this.fen();
                    const fenPieces = fen.split(" ");
                    fenPieces[1] = fenPieces[1] === "w" ? "b" : "w";
                    this.load(fenPieces.join(" "));

                    return move;
                } else {
                    throw new SafeError("not a king movement");
                }
            } catch (e) {
                // Make sure we aren't blundering the king
                if (this.isCheck()) {
                    return false;
                }
                let move: Move | boolean = false;
                try {
                    move = this.#virtual_board.move({
                        from: movefrom,
                        to: moveto,
                        promotion: "q",
                    });
                } catch (e) {
                    return false;
                }
                // If the move is valid, then continue the move forcefully
                if (move) {
                    const originalState = new Chess(this.fen());
                    // Force move on the primary board by updating it's FEN
                    this.load(this.#virtual_board.fen());
                    // Change the piece identifier to the inverse, as they will be replaced
                    this.#fused[movefrom] = originalState.get(movefrom).type;
                    // Update movement of any pieces that have been fused
                    for (const [square, piece] of Object.entries(this.#fused)) {
                        // Check if the piece is on the same square as the move
                        if (square === movefrom) {
                            // Remove the piece from the fused board
                            delete this.#fused[square];
                            // Add the piece to the new square
                            this.#fused[moveto] = piece;
                        } else if (square !== moveto) {
                            // For fused pieces that are not affected by this move, we need to
                            // update them back to their original state as they likely were mutated
                            this.put(
                                {
                                    type: originalState.get(square as Square).type,
                                    color: originalState.get(square as Square).color,
                                },
                                square as Square
                            );
                        }
                    }
                }
                this._updateVirtualBoard();
                return move;
            }
        }
    }

    /**
     * 0: FEN of the primary board
     * 1: Fused pieces
     * 2: FEN of the virtual board
     * 3: Pieces fused at the king's position
     */
    get positions(): [string, Record<string, string>, string, Record<Color, string>] {
        return [this.fen(), this.#fused, this.#virtual_board.fen(), this.#king_fused];
    }

    set fused(fused: string[]) {
        for (const piece of fused) {
            if (!piece) continue;
            const [square, pieceName] = piece.split("=");
            if (square === "wK" || square === "bK") continue;
            this.#fused[square] = pieceName.toLowerCase();
        }
        this._updateVirtualBoard();
    }

    set king_fused(fused: string[]) {
        for (const piece of fused) {
            if (!piece) continue;

            const [color, pieceName] = piece.split("=");
            this.#king_fused[color] = pieceName.toLowerCase();
        }
    }

    reset() {
        super.reset();
        this.#fused = {};
        this.#king_fused = {};
        this._updateVirtualBoard();
    }

    undo() {
        // Change the current state to the previous one in the history
        const undoAction = super.undo();
        if (!undoAction) return undoAction;
        this._updateVirtualBoard();

        // Undo any fused pieces that were attained in the previous move
        // this.#fused_history.pop();
        // this.#fused = this.#fused_history[-1];

        return undoAction;
    }

    history(): string[];
    history({ verbose }: { verbose: true }): (Move & { fen: string })[];
    history({ verbose }: { verbose: false }): string[];
    history({ verbose }: { verbose: boolean }): string[] | (Move & { fen: string })[];
    history({ verbose = false }: { verbose?: boolean } = {}) {
        // Obtain history from chess.ts
        const history = super.history({ verbose });
        return history;
    }

    moves(): string[];
    moves({ square }: { square: Square }): string[];
    moves({ verbose, square }: { verbose: true; square?: Square }): Move[];
    moves({ verbose, square }: { verbose: false; square?: Square }): string[];
    moves({ verbose, square }: { verbose?: boolean; square?: Square }): string[] | Move[];
    moves({ verbose = false, square = undefined }: { verbose?: boolean; square?: Square } = {}) {
        // Get the moves that chess.ts would normally return, and run additional filtering for fusion positions
        const moves = (super.moves({ verbose, square }) as Array<string | Move>).filter((move: Move | string) => {
            if (verbose && typeof move === "object") {
                if (this._willJeopardiseKing(move.from, move.to)) {
                    return false;
                }
            } else {
                if (this._willJeopardiseKing(move as string)) {
                    return false;
                }
            }
            return true;
        });

        return verbose ? (moves as Move[]) : (moves as string[]);
    }

    _willJeopardiseKing(move: string): boolean;
    _willJeopardiseKing(move: string, moveto: string): boolean;
    _willJeopardiseKing(move: string, moveto?: string): boolean {
        try {
            this._updateVirtualBoard();
            // Ensure both boards escape check states before moving
            // bugged config with rnb5/pp1k3p/2p1r1p1/8/5n2/8/PPPPB1PP/RNBQK1NR w - - 0 13 f4=q,
            if (this.fen() === this.#virtual_board.fen()) {
                // Optimisation: if both fens are the same then super.moves() will already have filtered out any jeopardising moves
                return false;
            }

            const copy = new Chess(this.fen());
            try {
                copy.move(moveto ? { from: move, to: moveto, promotion: "q" } : move);
                if (copy.isCheck()) {
                    return true;
                }
                throw new SafeError("standard board is ok");
            } catch (e) {
                // Try the virtual board
                copy.load(this.#virtual_board.fen());
                copy.move(moveto ? { from: move, to: moveto, promotion: "q" } : move);
                if (copy.isCheck()) {
                    return true;
                }
            }

            if (this.isKingChecking(move, moveto)) {
                return true;
            }
        } catch (e) {
            return true;
        }
        return false;
    }

    isKingChecking(movefrom?: string, moveto?: string): boolean {
        if (this.#king_fused[`${this.turn() === "w" ? "b" : "w"}K`] && (this.turn() === "w" ? "b" : "w")) {
            // Make sure that the opponent's king is not in check
            const opponentking = this.findKing(this.turn() === "w" ? "b" : "w");
            const copy = new Chess(this.fen());
            copy.remove(opponentking as Square);
            copy.put(
                {
                    type: this.#king_fused[`${this.turn() === "w" ? "b" : "w"}K`] as PieceSymbol,
                    color: this.turn() === "w" ? "b" : "w",
                },
                opponentking as Square
            );

            if (movefrom) {
                try {
                    copy.move(moveto ? { from: movefrom, to: moveto, promotion: "q" } : movefrom);
                } catch (e) {
                    return true;
                }
            }
            return copy.isCheck();
        }
        return false;
    }

    _getKingFusedMoves(): string[] {
        // Make a new copy of the entire board, accounting for virtual positions
        const copy = new FusionBoard();
        copy.load(this.fen());
        copy.#fused = this.#fused;
        copy._updateVirtualBoard();

        const king = this.findKing(this.turn());
        // Replace king with the fused piece
        copy.remove(king as Square);
        copy.put(
            {
                type: this.#king_fused[`${this.turn()}K`] as PieceSymbol,
                color: this.turn(),
            },
            king as Square
        );
        // Get the moves for the king
        const swappedMoves = copy.moves({ square: king, verbose: true });

        // Filter the moves to only include the moves that are valid for the current fused pieces
        const filteredMoves = swappedMoves.filter((move) => {
            // Check if the square is endangered
            if (copy.isAttacked(move.to, copy.turn() === "w" ? "b" : "w")) {
                return false;
            }
            return true;
        });
        // Return the moves
        return filteredMoves.map((move) => move.from + move.to);
    }

    getFusedMoves(fused: Array<string>, hovering: string): string[] {
        const target = this.get(fused[0] as Square);
        if (target.type === "k" && target.color === this.turn()) {
            // Run simulations on king movement
            return this._getKingFusedMoves();
        }
        // Get the moves for the current fused pieces
        const moves = this.#virtual_board.moves({ square: fused[0] as Square, verbose: true });
        // Filter the moves to only include the moves that are valid for the current fused pieces
        const filteredMoves = moves.filter((move) => {
            if (this._willJeopardiseKing(move.from, move.to)) {
                return false;
            }
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
        });
        // Return the filtered moves in UCI format
        return filteredMoves.map((move) => move.from + move.to);
    }

    private _updateVirtualBoard() {
        // Update the virtual board to reflect the current fused pieces
        try {
            this.#virtual_board.load(this.fen());
            for (const [square, piece] of Object.entries(this.#fused)) {
                this.#virtual_board.put(
                    { type: piece as PieceSymbol, color: this.get(square as Square).color },
                    square as Square
                );
            }
        } catch (e) {
            console.error("Error updating virtual board", e);
        }
    }

    isInStalemate() {
        return !this.isInCheck() && this.moves({ verbose: false }).length === 0;
    }

    // Cannot override isCheck, isStalemate, isCheckmate as it is used internally, causing a circular dependency
    isInCheck() {
        return super.isCheck() || this.#virtual_board.isCheck() || this.isKingChecking();
    }

    isInCheckmate() {
        return this.isInCheck() && this.moves({ verbose: false }).length === 0;
    }

    isDraw() {
        return super.isDraw() || this.isStalemate();
    }

    isGameOver() {
        return this.isInCheckmate() || this.isDraw();
    }

    findKing(colour: Color): Square {
        for (const square of SQUARES) {
            const piece = this.get(square);
            if (piece && piece.type === "k" && piece.color === colour) {
                return square as Square;
            }
        }
        throw new Error(`Unable to find ${colour} king.`);
    }

    isAttacked(square: Square, colour: Color): boolean {
        return super.isAttacked(square, colour) || this.#virtual_board.isAttacked(square, colour);
    }

    // _cannotBlockMate(king: Square) {
    //     let moves;
    //     if (this.isCheck()) {
    //         moves = this.moves().concat(this.#virtual_board.moves({ square: king, verbose: false }));
    //     } else {
    //         moves = this.moves({ square: king, verbose: false }).concat(this.#virtual_board.moves());
    //     }
    //     return moves.length === 0;
    // }

    // findChecker(): Square | undefined {
    //     // Scan every square for a square that is checking the king
    //     for (const square of SQUARES) {
    //         const piece = this.get(square);
    //         if (piece && piece.color !== this.turn()) {
    //             // Get the moves for the piece
    //             const moves = this.moves({ square: square as Square, verbose: true });
    //             // Check if the moves include the king
    //             for (const move of moves) {
    //                 if (move.to.includes(this.findKing() as string)) {
    //                     return square as Square;
    //                 }
    //             }
    //         }
    //     }
    //     return undefined;
    // }
}

export const PIECES = ["p", "n", "b", "r", "q", "k"];

class SafeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SafeError";
    }
}