package com.frankint.battleship.application.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserPresenceService {

    private final SimpMessagingTemplate messagingTemplate;

    // Track active sessions: username -> Set of sessionIds (to handle multiple tabs)
    private final Map<String, Set<String>> userSessions = new ConcurrentHashMap<>();

    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        Principal principal = event.getUser();
        if (principal != null) {
            String username = principal.getName();
            userSessions.computeIfAbsent(username, k -> ConcurrentHashMap.newKeySet()).add(event.getMessage().getHeaders().get("simpSessionId", String.class));
            log.info("User connected: {}", username);
            broadcastOnlineUsers();
        }
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        Principal principal = event.getUser();
        if (principal != null) {
            String username = principal.getName();
            String sessionId = event.getSessionId();
            Set<String> sessions = userSessions.get(username);
            if (sessions != null) {
                sessions.remove(sessionId);
                if (sessions.isEmpty()) {
                    userSessions.remove(username);
                }
            }
            log.info("User disconnected: {}", username);
            broadcastOnlineUsers();
        }
    }

    public void registerUserActive(String username) {
        userSessions.computeIfAbsent(username, k -> ConcurrentHashMap.newKeySet()).add("manual-" + System.currentTimeMillis());
        broadcastOnlineUsers();
    }

    public Set<String> getOnlineUsers() {
        return Collections.unmodifiableSet(userSessions.keySet());
    }

    public boolean isUserOnline(String username) {
        return userSessions.containsKey(username) && !userSessions.get(username).isEmpty();
    }

    public void broadcastOnlineUsers() {
        messagingTemplate.convertAndSend("/topic/online-users", getOnlineUsers());
    }
}
