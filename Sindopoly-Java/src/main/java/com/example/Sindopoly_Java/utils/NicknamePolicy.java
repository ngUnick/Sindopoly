package com.example.Sindopoly_Java.utils;

import org.springframework.stereotype.Component;

import java.text.Normalizer;

/** Canonical create-time display-name policy; player ID remains the identity. */
@Component
public class NicknamePolicy {
    public static final int MIN_CODE_POINTS = 2;
    public static final int MAX_CODE_POINTS = 15;

    public String acceptedName(String input) {
        if (input == null || input.length() > 64) {
            throw invalid();
        }
        String name = Normalizer.normalize(input, Normalizer.Form.NFC);
        int length = name.codePointCount(0, name.length());
        if (length < MIN_CODE_POINTS || length > MAX_CODE_POINTS) {
            throw invalid();
        }
        for (int offset = 0; offset < name.length();) {
            int codePoint = name.codePointAt(offset);
            Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
            boolean allowedLetter = Character.isLetter(codePoint)
                    && (script == Character.UnicodeScript.GREEK || script == Character.UnicodeScript.LATIN);
            if (!allowedLetter && codePoint != '_' && (codePoint < '0' || codePoint > '9')) {
                throw invalid();
            }
            offset += Character.charCount(codePoint);
        }
        return name;
    }

    private IllegalArgumentException invalid() {
        return new IllegalArgumentException("Nickname must be 2-15 Greek/Latin letters, ASCII digits or underscore");
    }
}
