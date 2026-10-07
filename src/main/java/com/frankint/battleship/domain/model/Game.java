package com.frankint.battleship.domain.model;

import lombok.Getter;

import java.util.UUID;

@Getter
public class Game {
    private final String id;
    private final Player player1;
    private Player player2; // Nullable until someone joins
    private String currentTurnPlayerId;
    private GameState state;
    private String winnerId;
    public static final int FLEET_SIZE = 5;

    public void terminate() {
        this.state = GameState.FINISHED;
    }

    // Constructor for a new game
    public Game(Player player1) {
        this.id = UUID.randomUUID().toString();
        this.player1 = player1;
        this.currentTurnPlayerId = player1.getId(); // Player 1 starts
        this.state = GameState.WAITING_FOR_PLAYER;
    }

    public static Game reconstitute(String id, Player p1, Player p2, String turn, GameState state, String winner) {
        Game game = new Game(p1);
        // We use reflection or direct assignment to force the state
        game.player2 = p2;
        game.currentTurnPlayerId = turn;
        game.state = state;
        game.winnerId = winner;

        // Overwrite the random ID generated in constructor with the real one from DB
        try {
            var idField = Game.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(game, id);
        } catch (Exception e) {
            throw new RuntimeException("Failed to reconstitute game", e);
        }
        return game;
    }

    public void join(Player player2) {
        if (state != GameState.WAITING_FOR_PLAYER) {
            throw new IllegalStateException("Game is already full or finished");
        }
        this.player2 = player2;
        this.state = GameState.SETUP;
    }

    public void placeShip(String playerId, ShipType type, Coordinate start, Orientation orientation) {
        // 1. Validation: Can only place in SETUP or WAITING (P1 waiting for P2)
        if (state != GameState.SETUP && state != GameState.WAITING_FOR_PLAYER) {
            throw new IllegalStateException("Cannot place ships in state: " + state);
        }

        Player player = getPlayerById(playerId);

        // 2. Prevent duplicate ships
        if (player.getBoard().hasPlacedShip(type)) {
            throw new IllegalArgumentException("You have already placed a " + type.getId());
        }

        // 3. Place the ship (Size is determined by ShipType, not the user!)
        player.getBoard().placeShip(type.getId(), type.getSize(), start, orientation);

        // 4. Check if both players are ready
        checkAndStartGame();
    }

    public ShotResult fire(String playerId, Coordinate target) {
        validateMove(playerId);

        Player opponent = playerId.equals(player1.getId()) ? player2 : player1;

        // 1. Fire the shot logic (Pure calculation)
        ShotResult result = opponent.getBoard().fireShot(target);

        // 2. Block duplicates immediately
        if (result == ShotResult.DUPLICATE) {
            throw new IllegalArgumentException("You have already fired at coordinate " + target);
        }

        // 3. Check Win Condition
        if (result == ShotResult.SUNK && opponent.hasLost()) {
            state = GameState.FINISHED;
            winnerId = playerId;
        }

        // 4. Switch Turn only when shot was a MISS
        if (result == ShotResult.MISS) {
            switchTurn();
        }

        return result;
    }

    private void validateMove(String playerId) {
        if (state != GameState.ACTIVE) {
            throw new IllegalStateException("Game is not active");
        }
        if (!playerId.equals(currentTurnPlayerId)) {
            throw new IllegalArgumentException("It is not your turn!");
        }
    }

    private void switchTurn() {
        if (state == GameState.ACTIVE) {
            currentTurnPlayerId = currentTurnPlayerId.equals(player1.getId())
                    ? player2.getId()
                    : player1.getId();
        }
    }

    private void checkAndStartGame() {
        if (state == GameState.WAITING_FOR_PLAYER) return; // Cannot start without P2

        boolean p1Ready = player1.getBoard().getShipCount() == FLEET_SIZE;
        boolean p2Ready = player2 != null && player2.getBoard().getShipCount() == FLEET_SIZE;

        if (p1Ready && p2Ready) {
            this.state = GameState.ACTIVE;
        }
    }

    private Player getPlayerById(String playerId) {
        if (player1.getId().equals(playerId)) return player1;
        if (player2 != null && player2.getId().equals(playerId)) return player2;
        throw new IllegalArgumentException("Player not found in this game");
    }
}
