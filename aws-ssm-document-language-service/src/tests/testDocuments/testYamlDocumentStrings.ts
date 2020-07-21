export const documentNoDoubleBracket = {
    text: `---
schemaVersion: '2.2'
mainSteps:
  - action: aws:applications
    name: example
    inputs:
      action: Install
      source: "source"
parameters:
  nouse:
    type: String`,
    diagnostics: [],
}

export const documentMissingParameters = {
    text: `---
    schemaVersion: '2.2'
    mainSteps:
      - action: aws:applications
        name: example
        inputs:
          action: Install
          source: "{{ source }}"
    `,
    diagnostics: [
        {
            message: 'Missing required property "parameters".',
            start: [7, 19],
            end: [7, 31],
        },
    ] as {
        message: string
        start: [number, number]
        end: [number, number]
    }[],
}

export const documentMissingOneElementUnderParameters = {
    text: `---
    schemaVersion: '2.2'
    mainSteps:
      - action: aws:applications
        name: example
        inputs:
          action: Install
          source: "{{ source }}"
    parameters:
      nouse:
        type: String
    `,
    diagnostics: [
        {
            message: 'Missing required property source under "parameters". source should be a parameter.',
            start: [7, 19],
            end: [7, 31],
        },
    ] as {
        message: string
        start: [number, number]
        end: [number, number]
    }[],
}

export const documentMissingMultipleElementsUnderParameters = {
    text: `---
schemaVersion: '2.2'
mainSteps:
  - action: aws:applications
    name: example
    inputs:
      action: Install
      source: "{{ source }}"
      sourceHash: "{{ sourceHash }}"
parameters:
  nouse:
    type: String`,
    diagnostics: [
        {
            message: 'Missing required property source under "parameters". source should be a parameter.',
            start: [7, 15],
            end: [7, 27],
        },
        {
            message: 'Missing required property sourceHash under "parameters". sourceHash should be a parameter.',
            start: [8, 19],
            end: [8, 35],
        },
    ] as {
        message: string
        start: [number, number]
        end: [number, number]
    }[],
}
