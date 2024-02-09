/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Implementation inspired by https://github.com/dorianbrown/rank_bm25/blob/990470ebbe6b28c18216fd1a8b18fe7446237dd6/rank_bm25.py#L52

export interface BM25Document {
    content: string
    /** The score that the document recieves. */
    score: number

    index: number
}

export abstract class BM25 {
    protected readonly corpusSize: number
    protected readonly avgdl: number
    protected readonly idf: Map<string, number> = new Map()
    protected readonly docLen: number[] = []
    protected readonly docFreqs: Map<string, number>[] = []
    protected readonly nd: Map<string, number> = new Map()

    constructor(
        protected readonly corpus: string[],
        protected readonly tokenizer: (str: string) => string[] = defaultTokenizer,
        protected readonly k1: number,
        protected readonly b: number,
        protected readonly epsilon: number
    ) {
        this.corpusSize = corpus.length

        let numDoc = 0
        corpus
            .map(document => {
                return tokenizer(document)
            })
            .forEach(document => {
                this.docLen.push(document.length)
                numDoc += document.length

                const frequencies = new Map<string, number>()
                document.forEach(word => {
                    frequencies.set(word, (frequencies.get(word) || 0) + 1)
                })
                this.docFreqs.push(frequencies)

                frequencies.forEach((freq, word) => {
                    this.nd.set(word, (this.nd.get(word) || 0) + 1)
                })
            })

        this.avgdl = numDoc / this.corpusSize

        this.calIdf(this.nd)
    }

    abstract calIdf(nd: Map<string, number>): void

    abstract score(query: string): BM25Document[]

    topN(query: string, n: number): BM25Document[] {
        const notSorted = this.score(query)
        const sorted = notSorted.sort((a, b) => b.score - a.score)
        return sorted.slice(0, Math.min(n, sorted.length))
    }
}

export class BM25Okapi extends BM25 {
    constructor(corpus: string[], tokenizer: (str: string) => string[] = defaultTokenizer) {
        super(corpus, tokenizer, 1.5, 0.75, 0.25)
    }

    calIdf(nd: Map<string, number>): void {
        let idfSum = 0

        const negativeIdfs: string[] = []
        for (const [word, freq] of nd) {
            const idf = Math.log(this.corpusSize - freq + 0.5) - Math.log(freq + 0.5)
            this.idf.set(word, idf)
            idfSum += idf

            if (idf < 0) {
                negativeIdfs.push(word)
            }
        }

        const averageIdf = idfSum / this.idf.size
        const eps = this.epsilon * averageIdf
        for (const word of negativeIdfs) {
            this.idf.set(word, eps)
        }
    }

    score(query: string): BM25Document[] {
        const queryWords = defaultTokenizer(query)
        return this.docFreqs.map((docFreq, index) => {
            let score = 0
            queryWords.forEach((queryWord, _) => {
                const queryWordFreqForDocument = docFreq.get(queryWord) || 0
                const numerator = (this.idf.get(queryWord) || 0.0) * queryWordFreqForDocument * (this.k1 + 1)
                const denominator =
                    queryWordFreqForDocument + this.k1 * (1 - this.b + (this.b * this.docLen[index]) / this.avgdl)

                score += numerator / denominator
            })

            return {
                content: this.corpus[index],
                score: score,
                index: index,
            }
        })
    }
}

// TODO: This is a very simple tokenizer, we want to replace this by more sophisticated one.
function defaultTokenizer(content: string): string[] {
    const regex = /\w+/g
    const words = content.split(' ')
    const result = []
    for (const word of words) {
        const wordList = findAll(word, regex)
        result.push(...wordList)
    }

    return result
}

function findAll(str: string, re: RegExp): string[] {
    let match: RegExpExecArray | null
    const matches: string[] = []

    while ((match = re.exec(str)) !== null) {
        matches.push(match[0])
    }

    return matches
}
