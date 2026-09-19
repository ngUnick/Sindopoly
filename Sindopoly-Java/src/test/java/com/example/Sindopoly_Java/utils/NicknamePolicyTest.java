package com.example.Sindopoly_Java.utils;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NicknamePolicyTest {
    private final NicknamePolicy policy = new NicknamePolicy();

    @Test
    void acceptsGreekLatinAndMixedNamesWithoutChangingCaseOrSigma() {
        for (String name : new String[] {"Νίκος", "Γιώργος", "Νικοσ", "ΝΙΚΟΣ", "Nikos", "AΑ_7", "ＡΒ"}) {
            assertThat(policy.acceptedName(name)).isEqualTo(name);
        }
        assertThat(policy.acceptedName("Νι\u0301κος")).isEqualTo("Νίκος");
        assertThat(policy.acceptedName("Α".repeat(15))).hasSize(15);
    }

    @Test
    void rejectsWhitespaceMarksSymbolsInvisibleCharactersAndInvalidLengths() {
        for (String name : new String[] {null, "", "Α", "Α".repeat(16), " Νίκος", "Νίκος ",
                "Νί κος", "Νί  κος", "Νίκος!", "Νίκος😀", "Α\u0301\u0301", "Α\u200BΒ",
                "Α\u202EΒ", "Α\nΒ", "АΒ"}) {
            assertThatThrownBy(() -> policy.acceptedName(name)).isInstanceOf(IllegalArgumentException.class);
        }
    }
}
