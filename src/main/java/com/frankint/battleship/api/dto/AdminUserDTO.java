package com.frankint.battleship.api.dto;

import java.util.List;

public record AdminUserDTO(
        String username,
        boolean online,
        int totalGames,
        List<String> recentGameIds
) {}
