// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import kotlin.math.ln

private val WORD_REGEX = """\w+""".toRegex()

// TODO: we still need NLTK tokenizer instead of this naive one
// tokenize given string and filter out non-english word
/**
 * Equivalent to the following:
 * String.tokenize(): List<String> {
 *     val s = this.split(" ")
 *     val res = mutableListOf<String>()
 *
 *     s.forEach {
 *         val temp = WORD_REGEX.findAll(it)
 *         res.addAll(temp.map { it.value })
 *     }
 *
 *     return res
 * }
 */
private fun String.tokenize(): List<String> = this.split(" ").map { str ->
    WORD_REGEX.findAll(str)
        .map { it.value }
        .toList()
}.flatten()

data class BM25Result(
    val docString: String,
    val score: Double
) : Comparable<BM25Result> {
    override fun compareTo(other: BM25Result): Int = compareValuesBy(other, this) { it.score }
}

// Kotlin implementation based on python library rank_bm25, refer to https://github.com/dorianbrown/rank_bm25 for more detail
abstract class BM25(val corpus: List<String>, tokenizer: (String) -> List<String>) {
    abstract val k1: Double
    abstract val b: Double
    abstract val epsilon: Double

    protected val corpusSize: Int = corpus.size
    protected val avgdl: Double
    protected val idf = mutableMapOf<String, Double>()
    protected val docLen = mutableListOf<Int>()
    protected val docFreqs = mutableListOf<Map<String, Int>>()

    protected val nd = mutableMapOf<String, Int>()

    protected val tokenize: (String) -> List<String> = tokenizer

    init {
        var numDoc = 0
        corpus
            .map { tokenize(it) }
            .forEach { document ->
                docLen.add(document.size)
                numDoc += document.size

                val frequencies = mutableMapOf<String, Int>()
                document.forEach { word ->
                    frequencies[word] = 1 + (frequencies[word] ?: 0)
                }
                docFreqs.add(frequencies)

                frequencies.forEach { (word, freq) ->
                    nd[word] = 1 + (nd[word] ?: 0)
                }
            }

        avgdl = numDoc.toDouble() / corpusSize

        calIdf(nd)
    }

    abstract fun calIdf(nd: Map<String, Int>)

    abstract fun score(query: String): List<BM25Result>

    fun topN(query: String, n: Int = 3): List<BM25Result> {
        val notSorted = score(query)
        val sorted = notSorted.sorted()

        return sorted.take(n)
    }
}

class BM250kapi(documentSets: List<String>, tokenizer: (String) -> List<String> = String::tokenize) : BM25(documentSets, tokenizer) {
    override val k1: Double
        get() = 1.5
    override val b: Double
        get() = 0.75
    override val epsilon: Double
        get() = 0.25

    override fun calIdf(nd: Map<String, Int>) {
        // collect idf sum to calculate an average idf for epsilon value
        var idfSum = 0.0
        // collect words with negative idf to set them a special epsilon value
        // idf can be negative if word is contained in mroe than half of documents
        val negativeIdfs = nd.mapNotNull { (word, freq) ->
            val idf = ln(this.corpusSize - freq + 0.5) - ln(freq + 0.5)
            this.idf[word] = idf
            idfSum += idf

            return@mapNotNull if (idf < 0) {
                word
            } else {
                null
            }
        }

        val averageIdf = idfSum / this.idf.size
        val eps = this.epsilon * averageIdf
        negativeIdfs.forEach { word ->
            this.idf[word] = eps
        }
    }

    override fun score(query: String): List<BM25Result> = this.docFreqs.mapIndexed { index, docFreq ->
        val score = tokenize(query).fold(0.0) { currScore, queryWord ->
            val queryWordFreqForDocument = docFreq[queryWord] ?: 0
            currScore + (idf[queryWord] ?: 0.0) * queryWordFreqForDocument * (k1 + 1) / (queryWordFreqForDocument + k1 * (1 - b + b * docLen[index] / avgdl))
        }

        BM25Result(corpus[index], score)
    }
}
