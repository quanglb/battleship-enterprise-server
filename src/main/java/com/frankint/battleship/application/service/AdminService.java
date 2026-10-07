package com.frankint.battleship.application.service;

import com.frankint.battleship.api.dto.AdminCreateUserRequest;
import com.frankint.battleship.api.dto.AdminGameDTO;
import com.frankint.battleship.api.dto.AdminUserDTO;
import com.frankint.battleship.application.port.out.GameRepository;
import com.frankint.battleship.domain.model.Game;
import com.frankint.battleship.domain.model.GameState;
import com.frankint.battleship.infrastructure.persistence.entity.UserEntity;
import com.frankint.battleship.infrastructure.persistence.jpa.JpaFriendRepository;
import com.frankint.battleship.infrastructure.persistence.jpa.JpaUserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class AdminService {

    private final JpaUserRepository userRepository;
    private final JpaFriendRepository friendRepository;
    private final GameRepository gameRepository;
    private final UserPresenceService userPresenceService;
    private final PasswordEncoder passwordEncoder;

    // --- 1. USER MANAGEMENT ---

    public List<AdminUserDTO> getAllUsers() {
        List<UserEntity> users = userRepository.findAll();
        List<Game> allGames = gameRepository.findAll();

        return users.stream().map(u -> {
            String uname = u.getUsername();
            boolean isOnline = userPresenceService.isUserOnline(uname);

            List<String> gameIds = allGames.stream()
                    .filter(g -> (g.getPlayer1() != null && uname.equals(g.getPlayer1().getId())) ||
                            (g.getPlayer2() != null && uname.equals(g.getPlayer2().getId())))
                    .map(Game::getId)
                    .toList();

            return new AdminUserDTO(uname, isOnline, gameIds.size(), gameIds);
        }).toList();
    }

    public Set<String> getOnlineUsers() {
        return userPresenceService.getOnlineUsers();
    }

    public void createUser(AdminCreateUserRequest request) {
        if (userRepository.existsById(request.username())) {
            throw new IllegalArgumentException("Username already exists");
        }
        UserEntity entity = new UserEntity();
        entity.setUsername(request.username());
        entity.setPassword(passwordEncoder.encode(request.password()));
        userRepository.save(entity);
        log.info("Admin created user: {}", request.username());
    }

    public void updatePassword(String username, String newPassword) {
        UserEntity user = userRepository.findById(username)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + username));
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        log.info("Admin updated password for user: {}", username);
    }

    @Transactional
    public void deleteUser(String username) {
        if (!userRepository.existsById(username)) {
            throw new IllegalArgumentException("User not found: " + username);
        }
        // Remove friendship records first
        friendRepository.findAllByUser(username).forEach(f -> friendRepository.delete(f));
        userRepository.deleteById(username);
        log.info("Admin deleted user: {}", username);
    }

    // --- 2. GAME MANAGEMENT ---

    public List<AdminGameDTO> getAllGames() {
        return gameRepository.findAll().stream().map(g -> new AdminGameDTO(
                g.getId(),
                g.getState(),
                g.getPlayer1() != null ? g.getPlayer1().getId() : null,
                g.getPlayer2() != null ? g.getPlayer2().getId() : null,
                g.getCurrentTurnPlayerId(),
                g.getWinnerId(),
                g.getPlayer1() != null ? g.getPlayer1().getBoard().getShipCount() : 0,
                g.getPlayer2() != null ? g.getPlayer2().getBoard().getShipCount() : 0
        )).toList();
    }

    public void deleteGame(String gameId) {
        gameRepository.delete(gameId);
        log.info("Admin deleted game: {}", gameId);
    }

    public void terminateGame(String gameId) {
        Optional<Game> opt = gameRepository.findById(gameId);
        if (opt.isPresent()) {
            Game game = opt.get();
            game.terminate();
            gameRepository.save(game);
            log.info("Admin forced game {} to FINISHED", gameId);
        } else {
            throw new IllegalArgumentException("Game not found: " + gameId);
        }
    }
}
