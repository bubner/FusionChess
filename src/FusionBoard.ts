import { Chess, Square, PieceSymbol, Move, Color, SQUARES, DEFAULT_POSITION } from "chess.js/src/chess";

/**
 * Function board with additional methods for board state analysis.
 * Extends from chess.js to provide all standard chess functionality.
 * @extends Chess
 */
class ChessBoard extends Chess {
    constructor(fen: string) {
        super(fen);
    }

    // Scan the board for a colour's king square
    findKing(colour: Color): Square {
        for (const square of SQUARES) {
            const piece = this.get(square);
            if (piece && piece.type === "k" && piece.color === colour) {
                return square as Square;
            }
        }
        throw new Error(`Unable to find ${colour} king.`);
    }

    // Check if the king square is attacked by a colour
    kingBeingAttacked(colour: Color): boolean {
        return this.isAttacked(this.findKing(colour), colour === "w" ? "b" : "w");
    }

    // Return inverse turn
    opponent() {
        return this.turn() === "w" ? "b" : "w";
    }

    // Get a UCI move (<source><target>) from a SAN move (<piece><square>)
    convertSanToUci(fen: string, san: string): string {
        const copy = new Chess(fen);
        try {
            copy.move(san);
        } catch (e) {
            throw new Error("SAN move is invalid.");
        }
        // Extract the move from the history
        const move = copy.history({ verbose: true })[copy.history().length - 1];
        return move.from + move.to;
    }
}

/**
 * Fusion chess board implementation
 * @author Lucas Bubner, 2023
 */
export default class FusionBoard extends ChessBoard {
    // Extending from the Chess class allows us to use the same implementation mechanics of normal chess
    // This allows us to use the same movePiece function and other functions that are already implemented

    #fused: Record<string, string>;
    #king_fused: Record<string, string>;
    #virtual_board: Chess;

    constructor() {
        super(DEFAULT_POSITION);
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
                    if (this.isAttacked(moveto, this.opponent())) {
                        return false;
                    }

                    const copy = new Chess(this.fen());
                    // Force replace the king on the board
                    copy.remove(movefrom);
                    copy.put(
                        { type: this.#king_fused[sourcesquare.color + "K"] as PieceSymbol, color: sourcesquare.color },
                        movefrom
                    );

                    this._fixMissingKing(copy);

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
        this._updateVirtualBoard();

        // king legal move test: rnb5/pp1k3p/2p1r1p1/8/5n2/8/PPPPB1PP/RNBQK1NR w - - 0 13 f4=q,
        // king fusion movement test: 8/ppK2k1p/6p1/2p5/3P4/8/PPP4P/RN4NR w - - 3 36 wK=r,
        // king fusion check test: rBb5/pp2k2p/6p1/2p5/8/3P4/PPP4P/RN2K1NR b - - 11 27 b8=n,wK=r,

        // Make a full copy of the Fusion Board
        const copy = new FusionBoard();
        copy.load(this.fen());
        copy.#fused = this.#fused;
        copy._updateVirtualBoard();

        try {
            // Check if the move will put the king in jeopardy
            if (!moveto) {
                // Must be in SAN format, convert to UCI
                const uci = copy.convertSanToUci(copy.fen(), move);
                move = uci.slice(0, 2);
                moveto = uci.slice(2, 4);
            }

            // move and moveto can only be of Square type now
            copy.movePiece(move as Square, moveto as Square);
            
            /* TODO: Bug here with king legal move test, this copy.move() throws an error and detects illegal moves
               but it cannot distinguish between virtual board and king illegal moves. */
            if (copy.kingBeingAttacked(copy.opponent()) || copy.isKingChecking(move, moveto)) {
                throw new SafeError("king is in jeopardy");
            }
        } catch (e) {
            // Also check if it was a king movement originally as if the move was illegal then it will bypass the king check
            if (e instanceof SafeError) {
                return true;
            }
        }

        return false;
    }

    isKingChecking(movefrom?: string, moveto?: string): boolean {
        if (this.#king_fused[`${this.opponent()}K`]) {
            // Make sure that the opponent's king is not in check
            const opponentking = this.findKing(this.opponent());
            const copy = new Chess(this.fen());
            if (movefrom) {
                // Force move on the board as it will register as an invalid move.
                // We do not have to worry about the actual validity as the calling function will already confirm legality
                const origin = copy.get(movefrom as Square);
                copy.remove(movefrom as Square);
                copy.put(origin, moveto as Square);
            }
            copy.remove(opponentking as Square);
            copy.put(
                {
                    type: this.#king_fused[`${this.opponent()}K`] as PieceSymbol,
                    color: this.opponent(),
                },
                opponentking as Square
            );
            
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

        this._fixMissingKing(copy);

        // Get the moves for the king
        const swappedMoves = copy.moves({ square: king, verbose: true });

        // Filter the moves to only include the moves that are valid for the current fused pieces
        const filteredMoves = swappedMoves.filter((move) => {
            // Check if the square is endangered
            if (copy.isAttacked(move.to, copy.opponent())) {
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

    // Fix a copy board from complaining of a nonexistent king. This is a crappy solution but .move doesn't work without a king.
    private _fixMissingKing(copy: Chess) {
        // Incredibly ugly solution, we need to put the king on the board to make a valid move so we're going to put it on a8
        let target: Square = "a8";
        copy.put({ type: "k", color: this.turn() }, target);

        // If that doesn't work, put it somewhere until there is no checks and we can make any move we want
        while (copy.isCheck() && !(this.isCheck() || this.#virtual_board.isCheck())) {
            copy.remove(target);
            target = SQUARES[Math.floor(Math.random() * SQUARES.length)];
            copy.put({ type: "k", color: this.turn() }, target);
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

/**
 * Special error to differentiate between errors thrown by the chess.js library and errors thrown by the FusionBoard.
 */
class SafeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SafeError";
    }
}
