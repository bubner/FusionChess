/**
 * Fusion chess board implementation
 * @author Lucas Bubner, 2023
 */
import { Chess, Square } from "chess.js/src/chess";

export default class FusionBoard extends Chess {
    // Extending from the Chess class allows us to use the same implementation mechanics of normal chess
    #fused: Record<string, string>;

    constructor() {
        super();
        // Initialise an empty fused board positions
        this.#fused = {};
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
                // If it is already fused, then replace it
                if (this.#fused[moveto]) {
                    delete this.#fused[moveto];
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

            console.log(this.#fused);

            // Return to the primary board after fusion procedure has completed
            return move;
        } catch (e) {
            // Stop if the first move was not valid
            return false;
        }
    }

    get positions(): [string, Record<string, string>] {
        return [this.fen(), this.#fused];
    }

    reset() {
        super.reset();
        this.#fused = {};
    }
}