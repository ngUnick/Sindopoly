package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.Square.SquareType;
import com.example.Sindopoly_Java.model.dto.BoardSquareMetadataDto;
import com.example.Sindopoly_Java.service.BoardMetadataService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class BoardMetadataControllerTest {

    @Mock BoardMetadataService boardMetadata;
    @InjectMocks BoardMetadataController controller;

    @Test
    void serializesStableBoardMetadataFieldNames() throws Exception {
        when(boardMetadata.getCanonicalBoard()).thenReturn(List.of(
                new BoardSquareMetadataDto(0, "ΑΦΕΤΗΡΙΑ", SquareType.START, null),
                new BoardSquareMetadataDto(1, "ΓΥΜΝΑΣΤΗΡΙΟ", SquareType.BROWN,
                        new BoardSquareMetadataDto.PropertyMetadata(60, 2, "BROWN"))));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(get("/api/board/squares"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].position").value(0))
                .andExpect(jsonPath("$[0].name").value("ΑΦΕΤΗΡΙΑ"))
                .andExpect(jsonPath("$[0].type").value("START"))
                .andExpect(jsonPath("$[0].property").isEmpty())
                .andExpect(jsonPath("$[1].property.purchasePrice").value(60))
                .andExpect(jsonPath("$[1].property.baseRent").value(2))
                .andExpect(jsonPath("$[1].property.group").value("BROWN"));
    }
}
