package com.frankint.battleship.api.controller;

import com.frankint.battleship.api.dto.AdminCreateUserRequest;
import com.frankint.battleship.api.dto.AdminGameDTO;
import com.frankint.battleship.api.dto.AdminUserDTO;
import com.frankint.battleship.application.service.AdminService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;
    private static final String REQUIRED_ADMIN = "quanglb";

    private void verifyAdmin(UserDetails user) {
        if (user == null || !REQUIRED_ADMIN.equalsIgnoreCase(user.getUsername())) {
            throw new org.springframework.security.access.AccessDeniedException("Access denied: Only user '" + REQUIRED_ADMIN + "' can access Admin HQ.");
        }
    }

    // --- Online & Users ---
    @GetMapping("/online")
    public ResponseEntity<Set<String>> getOnlineUsers(@AuthenticationPrincipal UserDetails user) {
        verifyAdmin(user);
        return ResponseEntity.ok(adminService.getOnlineUsers());
    }

    @GetMapping("/users")
    public ResponseEntity<List<AdminUserDTO>> getAllUsers(@AuthenticationPrincipal UserDetails user) {
        verifyAdmin(user);
        return ResponseEntity.ok(adminService.getAllUsers());
    }

    @PostMapping("/users")
    public ResponseEntity<Map<String, String>> createUser(
            @AuthenticationPrincipal UserDetails user,
            @Valid @RequestBody AdminCreateUserRequest request) {
        verifyAdmin(user);
        adminService.createUser(request);
        return ResponseEntity.ok(Map.of("message", "User created successfully"));
    }

    @PutMapping("/users/{username}/password")
    public ResponseEntity<Map<String, String>> updatePassword(
            @AuthenticationPrincipal UserDetails user,
            @PathVariable String username,
            @RequestBody Map<String, String> body) {
        verifyAdmin(user);
        String newPassword = body.get("password");
        if (newPassword == null || newPassword.length() < 6) {
            return ResponseEntity.badRequest().body(Map.of("error", "Password must be at least 6 characters"));
        }
        adminService.updatePassword(username, newPassword);
        return ResponseEntity.ok(Map.of("message", "Password updated successfully"));
    }

    @DeleteMapping("/users/{username}")
    public ResponseEntity<Map<String, String>> deleteUser(
            @AuthenticationPrincipal UserDetails user,
            @PathVariable String username) {
        verifyAdmin(user);
        adminService.deleteUser(username);
        return ResponseEntity.ok(Map.of("message", "User deleted successfully"));
    }

    // --- Games ---
    @GetMapping("/games")
    public ResponseEntity<List<AdminGameDTO>> getAllGames(@AuthenticationPrincipal UserDetails user) {
        verifyAdmin(user);
        return ResponseEntity.ok(adminService.getAllGames());
    }

    @PostMapping("/games/{gameId}/terminate")
    public ResponseEntity<Map<String, String>> terminateGame(
            @AuthenticationPrincipal UserDetails user,
            @PathVariable String gameId) {
        verifyAdmin(user);
        adminService.terminateGame(gameId);
        return ResponseEntity.ok(Map.of("message", "Game terminated"));
    }

    @DeleteMapping("/games/{gameId}")
    public ResponseEntity<Map<String, String>> deleteGame(
            @AuthenticationPrincipal UserDetails user,
            @PathVariable String gameId) {
        verifyAdmin(user);
        adminService.deleteGame(gameId);
        return ResponseEntity.ok(Map.of("message", "Game deleted"));
    }
}
