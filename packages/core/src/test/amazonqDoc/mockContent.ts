/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
export const ReadmeSections = {
    HEADER: `# My Awesome Project

This is a demo project showcasing various features and capabilities.`,

    GETTING_STARTED: `## Getting Started
1. Clone the repository
2. Run npm install
3. Start the application`,

    FEATURES: `## Features
- Fast processing
- Easy to use
- Well documented`,

    LICENSE: '## License\nMIT License',

    REPO_STRUCTURE: `## Repository Structure
/src
  /components
  /utils
/tests
  /unit
/docs`,

    DATA_FLOW: `## Data Flow
1. Input processing
    - Data validation
    - Format conversion
2. Core processing
    - Business logic
    - Data transformation
3. Output generation
    - Result formatting
    - Response delivery`,
} as const

export class ReadmeBuilder {
    private sections: string[] = []

    addSection(section: string): this {
        this.sections.push(section)
        return this
    }

    build(): string {
        return this.sections.join('\n\n')
    }

    static createBaseReadme(): string {
        return new ReadmeBuilder()
            .addSection(ReadmeSections.HEADER)
            .addSection(ReadmeSections.GETTING_STARTED)
            .addSection(ReadmeSections.FEATURES)
            .addSection(ReadmeSections.LICENSE)
            .build()
    }

    static createReadmeWithRepoStructure(): string {
        return new ReadmeBuilder()
            .addSection(ReadmeSections.HEADER)
            .addSection(ReadmeSections.REPO_STRUCTURE)
            .addSection(ReadmeSections.GETTING_STARTED)
            .addSection(ReadmeSections.FEATURES)
            .addSection(ReadmeSections.LICENSE)
            .build()
    }

    static createReadmeWithDataFlow(): string {
        return new ReadmeBuilder()
            .addSection(ReadmeSections.HEADER)
            .addSection(ReadmeSections.GETTING_STARTED)
            .addSection(ReadmeSections.FEATURES)
            .addSection(ReadmeSections.DATA_FLOW)
            .addSection(ReadmeSections.LICENSE)
            .build()
    }
}
