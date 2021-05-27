import * as StateControler from './stateController'

interface PropertyOptions {
    dependencies?: string[],
    prompt(state?: any): any,
}

export class Wizard<TForm> extends StateControler.StateMachineController<TForm> {
    private readonly formData = new Map<string | number | symbol, PropertyOptions>()
    private readonly resolvedForm = new Map<string | number | symbol, PropertyOptions>()
    
    public constructor(initState: TForm) {
        super({ initState })
    }

    /**
     * Resolves the dependency graph and builds the final controller
     */
    protected build(): void {
        const visited = new Set()

        this.formData.forEach((options, prop) => {

        })
    }

    public bind<TParent=TForm>(prop: keyof TParent, options: PropertyOptions): void {
        this.formData.set(prop, options)
    }
}