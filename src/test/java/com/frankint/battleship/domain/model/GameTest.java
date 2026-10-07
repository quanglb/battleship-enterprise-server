package com.frankint.battleship.domain.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class GameTest {
    @Test
    void testGameFlow() {
        // 1. Setup
        Player p1 = new Player("p1", new Board(10, 10));
        Player p2 = new Player("p2", new Board(10, 10));
        Game game = new Game(p1);

        // 2. Join (Transitions to SETUP)
        game.join(p2);
        assertEquals(GameState.SETUP, game.getState());

        // 3. Place Ships (Crucial Step: Game won't start without this)
        placeStandardFleet(game, "p1");
        placeStandardFleet(game, "p2");

        // 4. Verify Game Started
        assertEquals(GameState.ACTIVE, game.getState());

        // 5. P1 fires and HITS Carrier at (0, 0)
        ShotResult hitResult = game.fire("p1", new Coordinate(0, 0));
        assertEquals(ShotResult.HIT, hitResult);
        assertEquals("p1", game.getCurrentTurnPlayerId(), "P1 should keep turn after HIT");

        // 6. P1 fires again at MISS coordinate (9, 9)
        ShotResult missResult = game.fire("p1", new Coordinate(9, 9));
        assertEquals(ShotResult.MISS, missResult);
        assertEquals("p2", game.getCurrentTurnPlayerId(), "Turn switches to P2 after MISS");

        // 7. P1 fires again (Invalid - turn switched)
        assertThrows(IllegalArgumentException.class, () ->
                game.fire("p1", new Coordinate(9, 8))
        );

        // 8. P2 fires (Valid)
        assertDoesNotThrow(() -> game.fire("p2", new Coordinate(9, 9)));
    }
    @Test
    void testJoin_GameAlreadyStarted() {
        // 1. Setup
        Player p1 = new Player("p1", new Board(10, 10));
        Player p2 = new Player("p2", new Board(10, 10));
        Player p3 = new Player("p2", new Board(10, 10));
        Game game = new Game(p1);

        // 2. Join
        game.join(p2);
        assertEquals(GameState.SETUP, game.getState());
        assertThrows(IllegalStateException.class, () ->game.join(p3));
    }
    @Test
    void testValidateMove_GameNotStarted() {
        Player p1 = new Player("p1", new Board(10, 10));
        Game game = new Game(p1);
        assertThrows(IllegalStateException.class, () ->game.fire("p1", new Coordinate(0, 0)));
    }
    private void placeStandardFleet(Game game, String playerId) {
        // Place ships in simple rows to avoid collision
        game.placeShip(playerId, ShipType.CARRIER,    new Coordinate(0, 0), Orientation.HORIZONTAL);
        game.placeShip(playerId, ShipType.BATTLESHIP, new Coordinate(0, 1), Orientation.HORIZONTAL);
        game.placeShip(playerId, ShipType.CRUISER,    new Coordinate(0, 2), Orientation.HORIZONTAL);
        game.placeShip(playerId, ShipType.SUBMARINE,  new Coordinate(0, 3), Orientation.HORIZONTAL);
        game.placeShip(playerId, ShipType.DESTROYER,  new Coordinate(0, 4), Orientation.HORIZONTAL);
    }
}
