/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Implementation inspired by https://github.com/dorianbrown/rank_bm25/blob/990470ebbe6b28c18216fd1a8b18fe7446237dd6/rank_bm25.py#L52

export interface BMDocument {
    /** The document is originally scoreed. */
    index: number
    /** The score that the document recieves. */
    score: number

    content: string
}

export function performBM25Scoring(corpusList: string[], query: string): BMDocument[] {
    const wordFrequency: WordFrequency = initialize(corpusList)
    const idf: IDF = calcIdf(wordFrequency)
    const scoredDocs: BMDocument[] = getScore(wordFrequency, idf, query).map(value => {
        return {
            index: value.index,
            score: value.score,
            content: corpusList[value.index],
        }
    })
    // Sort the result in descending order of scores.
    return scoredDocs.sort((a: BMDocument, b: BMDocument) => b.score - a.score)
}

interface WordFrequency {
    docLen: number[]
    docFreqs: Map<string, number>[]
    corpusSize: number
    avgDl: number
    nd: Map<string, number>
}

interface IDF {
    idf: Map<string, number>
    averageIdf: number
}

const BM25Configs = {
    epsilon: 0.25,
    k1: 1.5,
    b: 0.75,
}

// TODO: This is a very simple tokenizer, we want to replace this by more sophisticated one.
function tokenize(content: string): string[] {
    const regex = /\w+/g
    const words = content.split(' ')
    const result = []
    for (const word of words) {
        const wordList = findAll(word, regex)
        result.push(...wordList)
    }

    return result
}

function initialize(corpus: string[]): WordFrequency {
    const docLen: number[] = []
    const docFreqs: Map<string, number>[] = []
    const nd: Map<string, number> = new Map()
    let numDoc = 0
    let corpusSize = 0

    corpus.forEach(document => {
        //TODO: Replace this simple split by better tokenizer
        const words = tokenize(document)
        docLen.push(words.length)
        numDoc += words.length

        const frequencies: Map<string, number> = new Map()
        words.forEach(word => {
            frequencies.set(word, (frequencies.get(word) || 0) + 1)
        })
        docFreqs.push(frequencies)

        frequencies.forEach((_, word) => {
            nd.set(word, (nd.get(word) || 0) + 1)
        })

        corpusSize += 1
    })

    const avgDl = numDoc / corpusSize
    return { docLen, docFreqs, corpusSize, avgDl, nd }
}

function calcIdf(wordFrequency: WordFrequency): IDF {
    const idf: Map<string, number> = new Map()
    let idfSum = 0
    const negativeIdfs: string[] = []
    const nd = wordFrequency['nd']
    const corpusSize = wordFrequency['corpusSize']

    nd.forEach((_, word) => {
        const freq = nd.get(word) || 0
        const idfValue = Math.log(corpusSize - freq + 0.5) - Math.log(freq + 0.5)
        idf.set(word, idfValue)
        idfSum += idfValue

        if (idfValue < 0) {
            negativeIdfs.push(word)
        }
    })

    const averageIdf = idfSum / idf.size
    const eps = BM25Configs['epsilon'] * averageIdf

    negativeIdfs.forEach(word => {
        idf.set(word, eps)
    })

    return { idf, averageIdf }
}

function getScore(wordFrequency: WordFrequency, idf: IDF, query: string) {
    return wordFrequency.docFreqs.map((docFreq, index) => {
        let score = 0
        const queryWords = tokenize(query)
        queryWords.forEach((queryWord, queryIndex) => {
            const queryWordFreqForDocument = docFreq.get(queryWord) || 0
            const numerator = (idf.idf.get(queryWord) || 0.0) * queryWordFreqForDocument * (BM25Configs.k1 + 1)
            const denominator =
                queryWordFreqForDocument +
                BM25Configs.k1 *
                    (1 - BM25Configs.b + (BM25Configs.b * wordFrequency['docLen'][index]) / wordFrequency['avgDl'])

            score += numerator / denominator
        })

        return {
            index: index,
            score: score,
        }
    })
}

function findAll(str: string, re: RegExp): string[] {
    let match: RegExpExecArray | null
    const matches: string[] = []

    // eslint-disable-next-line no-null/no-null
    while ((match = re.exec(str)) !== null) {
        matches.push(match[0])
    }

    return matches
}
