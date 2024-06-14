// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import software.aws.toolkits.jetbrains.services.codewhisperer.util.BM25
import software.aws.toolkits.jetbrains.services.codewhisperer.util.BM250kapi
import software.aws.toolkits.jetbrains.services.codewhisperer.util.BM25Result

class Bm25Test {
    private lateinit var sut: BM25
    private lateinit var tokenizer: (String) -> List<String>

    @Before
    fun setup() {
        tokenizer = { str: String ->
            str.split(" ")
        }
    }

    @Test
    fun `scores should return all scores and topN should return only highest n - simple case 1`() {
        val query = "windy London"
        val corpus = listOf(
            "Hello there good man!",
            "It is quite windy in London",
            "How is the weather today?"
        )

        sut = BM250kapi(corpus, tokenizer)
        val scores = sut.score(query)

        assertThat(scores).isEqualTo(
            listOf(
                BM25Result(docString = "Hello there good man!", score = 0.0),
                BM25Result(docString = "It is quite windy in London", score = 0.937294722506405),
                BM25Result(docString = "How is the weather today?", score = 0.0),
            )
        )

        assertThat(sut.topN(query, 1)).isEqualTo(
            listOf(
                BM25Result(docString = "It is quite windy in London", score = 0.937294722506405)
            )
        )
    }

    @Test
    fun `scores should return correct pair of document to its calculated score - simple case 2`() {
        val query = "codewhisperer is a machine learning powered code generator"
        val corpus = listOf(
            "codewhisperer goes GA at April 2023",
            "machine learning tool is the trending topic!!! :)",
            "codewhisperer is good =))))",
            "codewhisperer vs. copilot, which code generator better?",
            "copilot is a AI code generator too",
            "it is so amazing!!"
        )

        sut = BM250kapi(corpus, tokenizer)
        val scores = sut.score(query)

        assertThat(scores).isEqualTo(
            listOf(
                BM25Result(docString = "codewhisperer goes GA at April 2023", score = 0.0),
                BM25Result(docString = "machine learning tool is the trending topic!!! :)", score = 2.5075225906025422),
                BM25Result(docString = "codewhisperer is good =))))", score = 0.33539413050870837),
                BM25Result(docString = "codewhisperer vs. copilot, which code generator better?", score = 1.0935565858644076),
                BM25Result(docString = "copilot is a AI code generator too", score = 2.5673872789459544),
                BM25Result(docString = "it is so amazing!!", score = 0.33539413050870837)
            )
        )

        assertThat(sut.topN(query, 1)).isEqualTo(
            listOf(
                BM25Result(docString = "copilot is a AI code generator too", score = 2.5673872789459544)
            )
        )
        assertThat(sut.topN(query, 3)).isEqualTo(
            listOf(
                BM25Result(docString = "copilot is a AI code generator too", score = 2.5673872789459544),
                BM25Result(docString = "machine learning tool is the trending topic!!! :)", score = 2.5075225906025422),
                BM25Result(docString = "codewhisperer vs. copilot, which code generator better?", score = 1.0935565858644076),
            )
        )
    }
}
