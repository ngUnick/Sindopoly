package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.dto.ActionRequestDto;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.model.dto.CardDrawDto;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import com.example.Sindopoly_Java.service.transition.CommandMetadata;
import com.example.Sindopoly_Java.service.transition.CommandMetadataResolver;
import com.example.Sindopoly_Java.service.transition.TurnCommandService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class TurnControllerCharacterizationTest {
    @Mock TurnCommandService turnCommands;
    @Mock AuthenticatedPlayerResolver authenticatedPlayerResolver;
    @Mock CommandMetadataResolver commandMetadataResolver;
    @Mock Authentication authentication;
    @InjectMocks TurnController controller;
    private final CommandMetadata metadata = new CommandMetadata("00000000-0000-0000-0000-000000000001", 7);

    @Test
    void throwForwardsActorAndMetadata() {
        ThrowResultDto expected = new ThrowResultDto(7, 3, 4, 7,
                12, false, 5, 200, 8, false, null);
        when(commandMetadataResolver.resolve(metadata.commandId(), "7")).thenReturn(metadata);
        when(turnCommands.throwDice(3, 4, metadata)).thenReturn(expected);
        assertEquals(expected, controller.throwDice(3, 4, authentication, metadata.commandId(), "7"));
    }

    @Test
    void throwSerializesThematicCardMetadataThroughTheController() throws Exception {
        String text = "Ο φίλος σου που έχει αμάξι έφυγε πιο νωρίς σήμερα. Πήγαινε στη ΣΤΑΣΗ ΔΙΠΑΕ.";
        CardDrawDto card = new CardDrawDto(1, "Chance", text, "transport", 6);
        ThrowResultDto expected = new ThrowResultDto(7, 3, 4, 7,
                6, true, 1, 6, 8, false, card);
        when(commandMetadataResolver.resolve(metadata.commandId(), "7")).thenReturn(metadata);
        when(turnCommands.throwDice(3, 4, metadata)).thenReturn(expected);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(post("/api/turn/3/4/throw")
                        .header(CommandMetadata.COMMAND_ID_HEADER, metadata.commandId())
                        .header(CommandMetadata.EXPECTED_VERSION_HEADER, "7")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.die1").value(3))
                .andExpect(jsonPath("$.die2").value(4))
                .andExpect(jsonPath("$.total").value(7))
                .andExpect(jsonPath("$.dice").value(7))
                .andExpect(jsonPath("$.card.cardId").value(1))
                .andExpect(jsonPath("$.card.title").value("Chance"))
                .andExpect(jsonPath("$.card.text").value(text))
                .andExpect(jsonPath("$.card.effect").value("transport"))
                .andExpect(jsonPath("$.card.amount").value(6));
    }

    @Test
    void actionRejectsMismatchedBodyIdentityBeforeCommand() {
        ActionRequestDto body = new ActionRequestDto(99, 77, 5, true);
        assertThrows(AccessDeniedException.class,
                () -> controller.doAction(1, 2, body, authentication, metadata.commandId(), "7"));
        verify(turnCommands, never()).action(1, 2, true, metadata);
    }

    @Test
    void passUsesSameAuthoritativePath() {
        ActionResultDto expected = new ActionResultDto(1500, java.util.List.of(), 5, 8, false);
        when(commandMetadataResolver.resolve(metadata.commandId(), "7")).thenReturn(metadata);
        when(turnCommands.pass(3, 4, metadata)).thenReturn(expected);
        assertEquals(expected, controller.passOptional(3, 4, authentication, metadata.commandId(), "7").getBody());
    }
}
