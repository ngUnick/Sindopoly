package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.dto.BoardSquareMetadataDto;
import com.example.Sindopoly_Java.service.BoardMetadataService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/board")
public class BoardMetadataController {

    private final BoardMetadataService boardMetadata;

    public BoardMetadataController(BoardMetadataService boardMetadata) {
        this.boardMetadata = boardMetadata;
    }

    @GetMapping("/squares")
    public List<BoardSquareMetadataDto> squares() {
        return boardMetadata.getCanonicalBoard();
    }
}
