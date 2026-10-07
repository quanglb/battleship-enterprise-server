package com.frankint.battleship.infrastructure.persistence;

import com.frankint.battleship.application.port.out.GameRepository;
import com.frankint.battleship.domain.model.Game;
import com.frankint.battleship.infrastructure.persistence.entity.GameEntity;
import com.frankint.battleship.infrastructure.persistence.mapper.GameEntityMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Primary;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

interface JpaGameRepository extends JpaRepository<GameEntity, String> {

    // Only fetch if the user matches AND their specific visibility flag is true
    @Query("SELECT g FROM GameEntity g " +
            "LEFT JOIN g.player1 p1 " +  // Explicit Join
            "LEFT JOIN g.player2 p2 " +  // Explicit Join (Crucial for null player2)
            "WHERE " +
            "(p1.userId = :userId AND g.p1Visible = true) OR " +
            "(p2.userId = :userId AND g.p2Visible = true)")
    List<GameEntity> findVisibleGames(@Param("userId") String userId);
}

@Primary
@Repository
@RequiredArgsConstructor
public class PostgresGameRepository implements GameRepository {

    private final JpaGameRepository jpaRepository;
    private final GameEntityMapper mapper;

    @Override
    public Game save(Game game) {
        GameEntity entity = mapper.toEntity(game);

        Optional<GameEntity> existing = jpaRepository.findById(game.getId());

        if (existing.isPresent()) {
            // Existing game: Preserve current flags
            entity.setP1Visible(existing.get().isP1Visible());
            entity.setP2Visible(existing.get().isP2Visible());
        } else {
            // NEW GAME: Force visibility to TRUE
            entity.setP1Visible(true);
            entity.setP2Visible(true);
        }

        GameEntity saved = jpaRepository.save(entity);
        return mapper.toDomain(saved);
    }

    @Override
    public Optional<Game> findById(String gameId) {
        return jpaRepository.findById(gameId).map(mapper::toDomain);
    }

    @Override
    public void delete(String gameId) {
        jpaRepository.deleteById(gameId);
    }

    @Override
    public List<Game> findGamesByPlayer(String playerId) {
        return jpaRepository.findVisibleGames(playerId)
                .stream()
                .map(mapper::toDomain)
                .toList();
    }

    @Override
    public void hideGame(String gameId, String playerId) {
        jpaRepository.findById(gameId).ifPresent(entity -> {
            boolean changed = false;

            // Check Player 1
            if (entity.getPlayer1().getUserId().equals(playerId)) {
                entity.setP1Visible(false);
                changed = true;
            }
            // Check Player 2 (Null safe)
            else if (entity.getPlayer2() != null && entity.getPlayer2().getUserId().equals(playerId)) {
                entity.setP2Visible(false);
                changed = true;
            }

            if (changed) {
                jpaRepository.save(entity);
            }
        });
    }

    @Override
    public List<Game> findAll() {
        return jpaRepository.findAll()
                .stream()
                .map(mapper::toDomain)
                .toList();
    }
}