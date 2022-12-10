/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/method-signature-style */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
/* eslint-disable @typescript-eslint/prefer-optional-chain */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
export const DS: typeof document.querySelectorAll = document.querySelectorAll.bind(document)

export interface DomBuilderObject {
    type: string
    attributes?: Record<string, string> | undefined
    classNames?: string[] | undefined
    events?: Record<string, (event?: any) => any> | undefined
    children?: Array<string | DomBuilderObject | HTMLElement | ExtendedHTMLElement> | undefined
    innerHTML?: string | undefined
    persistent?: boolean | undefined
}

export interface DomBuilderObjectFilled {
    attributes?: Record<string, string | undefined>
    classNames?: string[]
    events?: Record<string, (event?: any) => any>
    children?: Array<string | DomBuilderObject | HTMLElement | ExtendedHTMLElement>
    innerHTML?: string | undefined
    persistent?: boolean
}

const EmptyDomBuilderObject: DomBuilderObject = {
    type: 'div',
    attributes: {},
    classNames: [],
    events: {},
    children: [],
    innerHTML: undefined,
    persistent: false,
}

export interface ExtendedHTMLElement extends HTMLInputElement {
    addClass(className: string): ExtendedHTMLElement
    removeClass(className: string): ExtendedHTMLElement
    toggleClass(className: string): ExtendedHTMLElement
    hasClass(className: string): boolean
    insertChild(
        position: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend',
        child:
            | string
            | DomBuilderObject
            | HTMLElement
            | ExtendedHTMLElement
            | Array<string | DomBuilderObject | HTMLElement | ExtendedHTMLElement>
    ): ExtendedHTMLElement
    clear(removePersistent?: boolean): ExtendedHTMLElement
    builderObject: DomBuilderObject
    update(builderObject: DomBuilderObjectFilled): ExtendedHTMLElement
}

export class DomBuilder {
    root: ExtendedHTMLElement
    private portals: Record<string, ExtendedHTMLElement> = {}

    constructor(rootSelector: string) {
        this.root = DS(rootSelector)[0] as ExtendedHTMLElement
        this.extendDomFunctionality(this.root)
    }

    addClass = function (this: ExtendedHTMLElement, className: string): ExtendedHTMLElement {
        if (className !== '') {
            this.classList.add(className)
            // eslint-disable-next-line @typescript-eslint/prefer-includes
            if (this.builderObject.classNames?.indexOf(className) === -1) {
                this.builderObject.classNames = [...this.builderObject.classNames, className]
            }
        }
        return this
    }

    removeClass = function (this: ExtendedHTMLElement, className: string): ExtendedHTMLElement {
        this.classList.remove(className)
        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
        if (this.builderObject.classNames !== undefined && this.builderObject.classNames.includes(className)) {
            this.builderObject.classNames.splice(this.builderObject.classNames.indexOf(className), 1)
        }
        return this
    }

    toggleClass = function (this: ExtendedHTMLElement, className: string): ExtendedHTMLElement {
        if (this.classList.contains(className)) {
            this.removeClass(className)
        } else {
            this.addClass(className)
        }
        return this
    }

    hasClass = function (this: ExtendedHTMLElement, className: string): boolean {
        return this.classList.contains(className)
    }

    insertChild = function (
        this: ExtendedHTMLElement,
        position: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend',
        child: string | HTMLElement | ExtendedHTMLElement | Array<string | HTMLElement | ExtendedHTMLElement>
    ): ExtendedHTMLElement {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (child) {
            if (child instanceof Array) {
                child.forEach(childItem => {
                    if (childItem instanceof Element) {
                        this.insertAdjacentElement(position, childItem)
                    } else if (typeof childItem === 'string') {
                        this.insertAdjacentText(position, childItem)
                    }
                })
            } else {
                if (child instanceof Element) {
                    this.insertAdjacentElement(position, child)
                } else if (typeof child === 'string') {
                    this.insertAdjacentText(position, child)
                }
            }
        }
        return this
    }

    clearChildren = function (this: ExtendedHTMLElement, removePersistent: boolean): ExtendedHTMLElement {
        Array.from(this.children).forEach((child: ExtendedHTMLElement | Element) => {
            if (
                removePersistent ||
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                !(child as ExtendedHTMLElement).builderObject ||
                (child as ExtendedHTMLElement).builderObject.persistent !== true
            ) {
                child.remove()
            }
        })
        return this
    }

    extendDomFunctionality = function (this: DomBuilder, domElement: HTMLElement): ExtendedHTMLElement {
        const extendedElement: ExtendedHTMLElement = domElement as ExtendedHTMLElement
        extendedElement.addClass = this.addClass.bind(extendedElement)
        extendedElement.removeClass = this.removeClass.bind(extendedElement)
        extendedElement.toggleClass = this.toggleClass.bind(extendedElement)
        extendedElement.hasClass = this.hasClass.bind(extendedElement)
        extendedElement.insertChild = this.insertChild.bind(extendedElement)
        extendedElement.clear = this.clearChildren.bind(extendedElement)
        return extendedElement
    }

    build = (domBuilderObject: DomBuilderObject): ExtendedHTMLElement => {
        const readyToBuildObject: DomBuilderObject = { ...EmptyDomBuilderObject, ...domBuilderObject }
        const buildedDom = document.createElement(readyToBuildObject.type)

        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        buildedDom.classList.add(...(readyToBuildObject.classNames?.filter(className => className !== '') || []))

        Object.keys(readyToBuildObject.events ?? {}).forEach((eventName: string) =>
            buildedDom.addEventListener(
                eventName,
                readyToBuildObject.events ? readyToBuildObject.events[eventName] : cancelEvent
            )
        )

        Object.keys(readyToBuildObject.attributes ?? {}).forEach(attributeName =>
            buildedDom.setAttribute(
                attributeName,
                readyToBuildObject.attributes !== undefined ? readyToBuildObject.attributes[attributeName] : ''
            )
        )

        if (typeof readyToBuildObject.innerHTML === 'string') {
            buildedDom.innerHTML = readyToBuildObject.innerHTML
        } else if (readyToBuildObject.children !== undefined && readyToBuildObject.children.length > 0) {
            this.insertChild.apply(buildedDom as ExtendedHTMLElement, [
                'beforeend',
                [
                    ...(readyToBuildObject.children as any[]).map(
                        (child: string | ExtendedHTMLElement | HTMLElement | DomBuilderObject) => {
                            if (typeof child === 'string' || child instanceof HTMLElement) {
                                return child
                            }
                            return this.build(child)
                        }
                    ),
                ],
            ])
        }

        ;(buildedDom as ExtendedHTMLElement).builderObject = readyToBuildObject
        ;(buildedDom as ExtendedHTMLElement).update = (builderObject: DomBuilderObjectFilled): ExtendedHTMLElement => {
            return this.update(buildedDom as ExtendedHTMLElement, builderObject)
        }
        this.extendDomFunctionality(buildedDom)
        return buildedDom as ExtendedHTMLElement
    }

    update = function (
        domToUpdate: ExtendedHTMLElement,
        domBuilderObject: DomBuilderObjectFilled
    ): ExtendedHTMLElement {
        if (domToUpdate.builderObject) {
            if (domBuilderObject.classNames !== undefined) {
                domToUpdate.classList.remove(...(domToUpdate.builderObject.classNames as string[]))
                domToUpdate.classList.add(...domBuilderObject.classNames.filter(className => className !== ''))
            }

            Object.keys(domBuilderObject.events ?? {}).forEach(eventName => {
                if (domToUpdate.builderObject.events !== undefined && domToUpdate.builderObject.events[eventName]) {
                    domToUpdate.removeEventListener(eventName, domToUpdate.builderObject.events[eventName])
                }
                if (domBuilderObject.events !== undefined && domBuilderObject.events[eventName] !== undefined) {
                    domToUpdate.addEventListener(eventName, domBuilderObject.events[eventName])
                }
            })

            Object.keys(domBuilderObject.attributes ?? {}).forEach(attributeName => {
                if (
                    domBuilderObject.attributes !== undefined &&
                    domBuilderObject.attributes[attributeName] === undefined
                ) {
                    domToUpdate.removeAttribute(attributeName)
                } else if (domBuilderObject.attributes !== undefined) {
                    domToUpdate.setAttribute(attributeName, domBuilderObject.attributes[attributeName] as string)
                }
            })

            if (typeof domBuilderObject.innerHTML === 'string') {
                domToUpdate.innerHTML = domBuilderObject.innerHTML
            } else if (domBuilderObject.children !== undefined && domBuilderObject.children.length > 0) {
                domToUpdate.clear()
                domToUpdate.insertChild('beforeend', domBuilderObject.children)
            }

            domToUpdate.builderObject = { ...EmptyDomBuilderObject, ...domBuilderObject } as DomBuilderObject
        } else {
            console.warn('element was not created with dom builder')
        }
        return domToUpdate
    }

    createPortal = (
        portalName: string,
        builderObject: DomBuilderObject,
        position: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend'
    ): ExtendedHTMLElement => {
        const portalDom = this.build(builderObject)
        this.root.insertChild(position || 'beforeend', portalDom)
        this.portals[portalName] = portalDom
        return portalDom
    }

    getPortal = (portalName: string): ExtendedHTMLElement => this.portals[portalName]
    removePortal = (portalName: string): void => this.portals[portalName].remove()
}

export const cancelEvent = (event: Event): boolean => {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return false
}
