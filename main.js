// ==UserScript==
// @name         XHR Monitor Debugger Hook
// @namespace    https://github.com/JSREI/js-xhr-monitor-debugger-hook
// @version      0.1
// @description  XHR相关的一些Hook，用于辅助提高XHR类型的加密的逆向效率
// @author       CC11001100
// @match       *://*/*
// @run-at      document-start
// @grant       none
// @require     file://D:\workspace\js-xhr-monitor-debugger-hook\main.js
// ==/UserScript==
(() => {

    // TODO 把XMLHttpRequestHook.prototype.open保护起来，以免有直接通过XMLHttpRequestHook.prototype.open设置参数的情况

    // 目前所有的xhr断点
    const xhrDebuggerArray = [{
        // { string | RegExp | null } 对要访问的连接过滤
        requestUrlCondition: "api/ccw/project/evaluation/getList/",

        // { string | RegExp | null } 对发送的请求中的参数名过滤
        requestParamNameCondition: null,

        // { string | RegExp | null } 对发送的请求中的参数值过滤
        requestParamValueCondition: null,

        // { string | RegExp | null } 对发送的请求中的请求头的名字过滤
        setRequestHeaderNameCondition: null,

        // { string | RegExp | null } 对发送的请求中的请求头的值过滤
        setRequestHeaderValueCondition: null,

        // { string | RegExp | null } 按请求头过滤
        requestBodyCondition: null,

        // { string | RegExp | null } 对响应头的名字过滤
        getResponseHeaderNameCondition: null,

        // { string | RegExp | null } 对响应头的值过滤
        getResponseHeaderValueCondition: null,

        // { string | RegExp | null } 按响应体过滤
        responseBodyCondition: null,

        // { boolean } 是否在请求发送前进入断点
        enableDebuggerBeforeRequestSend: true,

        // { boolean } 是否在请求发送后进入断点
        enableDebuggerAfterResponseReceive: true,

        // TODO
        // 设置触发各种操作的时候是否开启断点，以避免断点太多太烦
        actionDebuggerEnable: {
            open: true,
            setRequestHeader: true,
            send: true,
            // 执行回调的时候
            responseCallback: true,
            visitResponseAttribute: false,
        }
    },

        // 断点可以同时存在多个，数组继续往下放就可以了
        // {
        //     // { string | RegExp | null } 对要访问的连接过滤
        //     requestUrlCondition: null,
        //
        //     // { string | RegExp | null } 对发送的请求中的参数名过滤
        //     requestParamNameCondition: null,
        //
        //     // { string | RegExp | null } 对发送的请求中的参数值过滤
        //     requestParamValueCondition: null,
        //
        //     // { string | RegExp | null } 对发送的请求中的请求头的名字过滤
        //     setRequestHeaderNameCondition: null,
        //
        //     // { string | RegExp | null } 对发送的请求中的请求头的值过滤
        //     setRequestHeaderValueCondition: null,
        //
        //     // { string | RegExp | null } 按请求头过滤
        //     requestBodyCondition: null,
        //
        //     // { string | RegExp | null } 对响应头的名字过滤
        //     getResponseHeaderNameCondition: null,
        //
        //     // { string | RegExp | null } 对响应头的值过滤
        //     getResponseHeaderValueCondition: null,
        //
        //     // { string | RegExp | null } 按响应体过滤
        //     responseBodyCondition: null,
        //
        //     // { boolean } 是否在请求发送前进入断点
        //     enableDebuggerBeforeRequestSend: true,
        //
        //     // { boolean } 是否在请求发送后进入断点
        //     enableDebuggerAfterResponseReceive: true,
        // },

    ];

    // -------------------------------------------- --------------------------------------------------------------------

    /**
     * 用于分发生成唯一ID
     */
    class IDGenerator {

        /**
         * 可以制定一个可选的ID前缀，如果指定的话生成的每个ID都有相同的前缀，未指定的话则ID无前缀只是一个自增的数字
         *
         * @param idPrefix
         */
        constructor(idPrefix = "") {
            this.idPrefix = idPrefix;
            this.next = 1;
        }

        /**
         * 返回下一个ID
         *
         * @return {string|number}
         */
        nextID() {
            const next = this.next;
            this.next++;
            if (this.idPrefix) {
                return `${this.idPrefix}-${next.toString().padStart(8, "0")}`;
            } else {
                return next;
            }
        }
    }

    // -------------------------------------------- --------------------------------------------------------------------

    /**
     * 用于全局暴露函数
     */
    class GlobalVariableManager {

        constructor() {
            this.idGenerator = new IDGenerator();
            this.cacheMap = new Map();
        }

        /**
         * 暴露一个函数到全局作用域，如果之前已经暴露过则返回之前的名称，否则分配一个新的名称，暴露之后把新的名称返回
         *
         * @param globalVariablePrefix {string} 可以指定一个可选的全局前缀，如果指定了的话挂载到的全局变量则会使用这个字符串作为前缀
         * @param funcPointer {Function} 要挂载为全局的函数
         */
        setGlobal(globalVariablePrefix, funcPointer) {
            if (this.cacheMap.has(funcPointer)) {
                return this.cacheMap.get(funcPointer);
            }
            const globalVariable = `cc11001100_xhr_monitor_debugger_hook_${globalVariablePrefix}_${this.idGenerator.next()}`;
            window[globalVariable] = funcPointer;
            this.cacheMap[funcPointer] = globalVariable;
            return globalVariable;
        }

    }

    const globalVariableManager = new GlobalVariableManager();

    // -------------------------------------------- --------------------------------------------------------------------

    // // 不让清屏
    // window.console.clear = function () {
    // }
    //
    // class ConsoleDisable {
    //
    // }

    /**
     * 这个类用于负责Class、原型相关的的Hook替换操作
     */
    class XMLHttpRequestPrototypeHook {

        /**
         * 向原型链上添加Hook
         */
        hook() {
            // 持有一份最纯净的原型
            const ancestorXMLHttpRequestHolder = window.XMLHttpRequest;
            // 这个持有的是当前最新的值，如果有多次Hook的话可能会被修改
            let XMLHttpRequestHolder = window.XMLHttpRequest;
            let cachedProxyXHR = null;
            Object.defineProperty(window, "XMLHttpRequest", {
                get: () => {
                    if (!cachedProxyXHR) {
                        cachedProxyXHR = new Proxy(XMLHttpRequestHolder, {
                            // new XMLHttpRequest()的时候给替换掉返回的对象
                            construct(target, argArray, newTarget) {
                                const xhrObject = new XMLHttpRequestHolder();
                                return new XMLHttpRequestObjectHook(xhrObject).addHook();
                            },
                            // get(target, p, receiver) {
                            //     return target[p];
                            // },
                            // getPrototypeOf(target) {
                            //     // 应该如何Hook住对原型链的修改呢？
                            //     // TODO 当访问原型的时候将其拦截住，因为有些拦截器是通用在原型上添加的
                            //     debugger;
                            // }
                        });
                    }
                    return cachedProxyXHR;
                }, set: newValue => {
                    // 缓存失效
                    cachedProxyXHR = null;
                    // 设置为新的值，可能会存在多层嵌套的情况
                    XMLHttpRequestHolder = newValue;
                },
                configurable: true,
            })
        }
    }

    /**
     * 这个操作用于Hook对象上的操作
     */
    class XMLHttpRequestObjectHook {

        static xhrIDGenerator = new IDGenerator("CC1100110-XHR-ID");

        /**
         * 为XHR对象添加Hook
         *
         * @param xhrObject
         */
        constructor(xhrObject) {
            // 被Hook的xhr对象
            this.xhrObject = xhrObject;
            // 持有着xhr相关的一些上下文信息，为其初始化一个
            this.xhrContext = new XMLHttpRequestContext(XMLHttpRequestObjectHook.xhrIDGenerator.nextID());
        }

        /**
         * 为被Hook的XHR对象添加各种Hook
         *
         * @return {boolean|(function(): (*|null))|*|(() => void)|ProgressEvent<FileReader>|ProgressEvent<XMLHttpRequestEventTarget>|Event|((reason?: any) => Promise<void>)|((reason?: any) => AbortSignal)|(() => Promise<void>)|((reason?: any) => void)|UnderlyingSinkAbortCallback|((mime: string) => void)|Proxy<Function>}
         */
        addHook() {
            const _this = this;
            return new Proxy(this.xhrObject, {
                get(target, p, receiver) {
                    switch (p) {

                        // 请求相关的方法

                        case "open":
                            return _this.addOpenHook();
                        case "send":
                            return _this.addSendHook();
                        case "setRequestHeader":
                            return _this.addSetRequestHeaderHook();
                        case "abort":
                            return _this.addAbortHook();
                        case "overrideMimeType":
                            return _this.addOverrideMimeTypeHook();

                        // 请求相关的属性

                        // 这几个属性就忽略不再拦截了
                        case "readyState":
                        case "timeout":
                        case "upload":
                        case "withCredentials":
                            return target[p];

                        // 响应相关的方法
                        case "getAllResponseHeaders":
                        case "getResponseHeader":
                            return _this.addVisitResponseHeaderHook(p);
                        // 响应相关的属性
                        case "response":
                        case "responseText":
                        case "responseType":
                        case "responseURL":
                        case "responseXML":
                            return _this.addVisitResponsePropertyHook(p);
                        case "status":
                        case "statusText":
                            return target[p];
                        // 事件处理，搞一个专门的单元来处理，添加事件可以通过addEventListener
                        // 也可以直接on+事件名称，所以要把两种情况都覆盖住
                        case "addEventListener":
                            return _this.addAddEventListenerHook();

                        default:
                            // 其它情况就不拦截了，直接放行
                            return target[p];
                    }
                }, set(target, p, value, receiver) {
                    switch (p) {
                        case "onabort":
                            return _this.addOnabortHook();
                        case "onerror":
                        case "onload":
                        case "onloadend":
                        case "onloadstart":
                        case "onprogress":
                        case "ontimeout":
                            target[p] = value;
                            return true;
                        case "onreadystatechange":
                            return _this.addOnreadystatechangeHook(value);
                        // case "withCredentials":
                        //     // 设置携带凭证的时候拦截一下
                        //     return _this.addWithCredentialsHook();
                        default:
                            // 默认情况下就直接赋值，不再尝试Hook
                            target[p] = value;
                            return true;
                    }
                }
            });
        }

        /**
         * 增加访问响应内容时的Hook
         *
         * @param {string} propertyName
         */
        addVisitResponsePropertyHook(propertyName) {
            const _this = this;

            // 打印拦截到访问XHR响应属性的日志
            try {
                const valueStyle = `color: black; background: #CCCC00; font-size: ${consoleLogFontSize}px; font-weight: bold;`;
                const normalStyle = `color: black; background: #EEEE33; font-size: ${consoleLogFontSize}px;`;
                const message = [

                    normalStyle,
                    now(),

                    normalStyle,
                    " XHR Monitor Debugger Hook: ",

                    normalStyle,
                    "xhr request id = ",

                    valueStyle,
                    `${_this.xhrContext.id}`,

                    normalStyle,
                    ", action = ",

                    valueStyle,
                    "visit xhr response attribute",

                    normalStyle,
                    ", url = ",

                    valueStyle,
                    `${_this.xhrContext.requestUrlString}`,

                    normalStyle,
                    `, visit response attribute name = `,

                    valueStyle,
                    `${propertyName}`,

                    normalStyle,
                    ", value = ",

                    valueStyle,
                    `${_this.xhrObject[propertyName]}`,

                    normalStyle,
                    `, code location = ${cc11001100_getCodeLocation()}`];
                console.log(genFormatArray(message), ...message);
            } catch (e) {
                console.error(e);
            }

            try {
                // 断点测试
                this.xhrContext[propertyName] = this.xhrObject[propertyName];
                for (let xhrDebugger of xhrDebuggerArray) {
                    if (xhrDebugger.test(this.xhrContext)) {
                        // 当前操作： XMLHttpRequest visit response attribute
                        debugger;
                    }
                }
            } catch (e) {
                console.error(e);
            }
            return this.xhrObject[propertyName];
        }

        /**
         * 为XHR添加事件响应函数时将被拦截到
         *
         * @return {*}
         */
        addAddEventListenerHook() {
            const _this = this;
            return new Proxy(this.xhrObject.addEventListener, {
                apply(target, thisArg, argArray) {

                    const [eventName, eventFunction] = argArray

                    // 打印拦截到访问XHR响应属性的日志
                    try {
                        const valueStyle = `color: black; background: #669934; font-size: ${consoleLogFontSize}px; font-weight: bold;`;
                        const normalStyle = `color: black; background: #65CC66; font-size: ${consoleLogFontSize}px;`;
                        const message = [

                            normalStyle,
                            now(),

                            normalStyle,
                            "XHR Monitor Debugger Hook: ",

                            normalStyle,
                            "id = ",

                            valueStyle,
                            `${_this.xhrContext.id}, `,

                            normalStyle,
                            "xhr url = ",

                            // valueStyle,
                            // `${_this.xhrContext.requestUrlString}, `,
                            //
                            // normalStyle,
                            // `visit response attribute name = `,
                            //
                            // valueStyle,
                            // `${propertyName}, `,
                            //
                            // normalStyle,
                            // "value = ",
                            //
                            // valueStyle,
                            // `${_this.xhrObject[propertyName]}, `,

                            normalStyle,
                            `, code location = ${cc11001100_getCodeLocation()}`];
                        console.log(genFormatArray(message), ...message);
                    } catch (e) {
                        console.error(e);
                    }

                    // TODO 2023-1-3 01:21:21 断点测试
                    try {
                        // switch (eventName) {
                        //     case "readystatechange":
                        //     // TODO
                        // }
                    } catch (e) {
                        console.error(e);
                    }

                    return target.apply(_this.xhrObject, argArray);
                }
            });
        }

        /**
         * 为open添加代理，以便在访问的时候能够拦截得到
         *
         * @returns {Proxy<Function>}
         */
        addOpenHook() {
            const _this = this;
            return new Proxy(this.xhrObject.open, {
                apply(target, thisArg, argArray) {

                    // 从第三个参数开始是可选的
                    const [method, url, isAsync, user, password] = argArray;

                    _this.xhrContext.requestUrlString = url;
                    // TODO 解析请求参数
                    // _this.xhrContext.requestParamPairMap =

                    // 打印日志
                    try {

                        const valueStyle = `color: black; background: #669934; font-size: ${consoleLogFontSize}px; font-weight: bold;`;
                        const normalStyle = `color: black; background: #65CC66; font-size: ${consoleLogFontSize}px;`;

                        const message = [

                            normalStyle,
                            now(),

                            normalStyle,
                            " XHR Monitor Debugger Hook: ",

                            normalStyle,
                            "xhr request id = ",

                            valueStyle,
                            `${_this.xhrContext.id}`,

                            normalStyle,
                            ", action = ",

                            valueStyle,
                            "xhr open",

                            normalStyle,
                            ", url = ",

                            valueStyle,
                            `${url}`,

                            // 从第三个参数开始是可选的，
                            ...(() => {
                                return [// async
                                    ...(() => {
                                        if (isAsync !== undefined) {
                                            return [normalStyle, ", async = ", valueStyle, `${isAsync}`,];
                                        } else {
                                            return [];
                                        }
                                    })(), // user & password
                                    ...(() => {
                                        if (user !== undefined) {
                                            return [normalStyle, ", user = ", valueStyle, `${user}`, normalStyle, ", password = ", valueStyle, `${password}`,];
                                        } else {
                                            return [];
                                        }
                                    })(),];
                            })(),

                            normalStyle,
                            `, code location = ${cc11001100_getCodeLocation()}`];
                        console.log(genFormatArray(message), ...message);
                    } catch (e) {
                        console.error(e);
                    }

                    // 测试断点
                    try {
                        for (let xhrDebugger of xhrDebuggerArray) {
                            if (xhrDebugger.test(_this.xhrContext)) {
                                // 当前操作：XMLHttpRequest open
                                debugger;
                            }
                        }
                    } catch (e) {
                        console.error(e);
                    }

                    return target.apply(_this.xhrObject, argArray);
                }
            });
        }

        /**
         * 为send方法生成代理对象并返回
         *
         * @returns {Proxy<Function>}
         */
        addSendHook() {
            const _this = this;
            return new Proxy(this.xhrObject.send, {
                apply(target, thisArg, argArray) {

                    // send只会有有一个参数
                    const [data] = argArray;

                    try {
                        const valueStyle = `color: black; background: #3399CC; font-size: ${consoleLogFontSize}px; font-weight: bold;`;
                        const normalStyle = `color: black; background: #0099FF; font-size: ${consoleLogFontSize}px;`;

                        const message = [

                            normalStyle,
                            now(),

                            normalStyle,
                            " XHR Monitor Debugger Hook: ",

                            normalStyle,
                            "xhr request id = ",

                            valueStyle,
                            `${_this.xhrContext.id}`,

                            normalStyle,
                            ", action = ",

                            valueStyle,
                            "xhr send",

                            normalStyle,
                            ", url = ",

                            valueStyle,
                            `${_this.xhrContext.requestUrlString}`,

                            normalStyle,
                            ", body = ",

                            valueStyle,
                            `${data}`,

                            normalStyle,
                            `, code location = ${cc11001100_getCodeLocation()}`];
                        console.log(genFormatArray(message), ...message);
                    } catch (e) {
                        console.error(e);
                    }

                    // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/send
                    // post设置body的情况要能够拦截得到
                    try {
                        if (data) {
                            // data可能会是以下几种类型：
                            // Blob | BufferSource | FormData | URLSearchParams | string
                            if (typeof data === "string") {
                                // request body 是 string 类型，大多数情况下也是这种类型
                                for (let xhrDebugger of xhrDebuggerArray) {
                                    if (xhrDebugger.test(_this.xhrContext)) {
                                        // 当前操作：XMLHttpRequest send
                                        debugger;
                                    }
                                }
                            } else if (data.prototype === Blob.prototype) {
                                // Blob 类型
                                // TODO 二进制类型
                            } else if (data.prototype === ArrayBuffer.prototype) {
                                // ArrayBuffer 类型
                                // TODO 二进制类型
                            } else if (data.prototype === FormData.prototype) {
                                // ArrayBufferView 类型
                                // TODO 表单参数匹配
                            } else if (data.prototype === URLSearchParams.prototype) {
                                // URLSearchParams 类型
                                // TODO 参数匹配
                            }
                        }
                    } catch (e) {
                        console.error(e);
                    }

                    return target.apply(_this.xhrObject, argArray);
                }
            });
        }

        /**
         * 设置请求头的时候拦截一下
         *
         * @returns {Proxy<Function>}
         */
        addSetRequestHeaderHook() {
            const _this = this;
            return new Proxy(this.xhrObject.setRequestHeader, {
                apply(target, thisArg, argArray) {

                    // 设置的请求头的名字和值，名字和值都是字符串类型
                    const [requestHeaderName, requestHeaderValue] = argArray;

                    // 打印日志
                    try {
                        const valueStyle = `color: black; background: #CC6600; font-size: ${consoleLogFontSize}px; font-weight: bold;`;
                        const normalStyle = `color: black; background: #FF9933; font-size: ${consoleLogFontSize}px;`;
                        const message = [
                            normalStyle,
                            now(),

                            normalStyle,
                            " XHR Monitor Debugger Hook: ",

                            normalStyle,
                            "xhr request id = ",

                            valueStyle,
                            `${_this.xhrContext.id}`,

                            normalStyle,
                            ", action = ",

                            valueStyle,
                            "xhr setRequestHeader",

                            normalStyle,
                            ", url = ",

                            valueStyle,
                            `${_this.xhrContext.requestUrlString}`,

                            normalStyle,
                            ", requestHeaderName = ",

                            valueStyle,
                            `${requestHeaderName}`,

                            normalStyle,
                            ", requestHeaderValue = ",

                            valueStyle,
                            `${requestHeaderValue}`,

                            normalStyle,
                            `, code location = ${cc11001100_getCodeLocation()}`];
                        console.log(genFormatArray(message), ...message);
                    } catch (e) {
                        console.error(e);
                    }

                    // 测试断点
                    try {
                        // debugger;
                        // 设置上下文
                        _this.xhrContext.setRequestHeaderContext = {
                            requestHeaderName: requestHeaderName, requestHeaderValue: requestHeaderValue,
                        }
                        // 测试断点
                        for (let xhrDebugger of xhrDebuggerArray) {
                            // 将鼠标移动到xhrDebugger上即可查看命中的断点是哪个
                            if (xhrDebugger.test(_this.xhrContext)) {
                                // 当前操作：XMLHttpRequest setRequestHeader
                                debugger;
                            }
                        }
                        // 清空上下文
                        _this.xhrContext.setRequestHeaderContext = {
                            requestHeaderName: null, requestHeaderValue: null,
                        };
                    } catch (e) {
                        console.error(e);
                    }

                    return target.apply(_this.xhrObject, argArray);
                }
            });
        }

        addAbortHook() {
            const _this = this;
            return new Proxy(this.xhrObject.abort, {
                apply(target, thisArg, argArray) {
                    // TODO
                    return target.apply(_this.xhrObject, argArray);
                }
            });
        }

        addOverrideMimeTypeHook() {
            const _this = this;
            return new Proxy(this.xhrObject.overrideMimeType, {
                apply(target, thisArg, argArray) {
                    // TODO
                    return target.apply(_this.xhrObject, argArray);
                }
            });
        }

        // -------------------------------------------- --------------------------------------------------------------------


        //                         case "onerror":
        //                         case "onload":
        //                         case "onloadend":
        //                         case "onloadstart":
        //                         case "onprogress":
        //                         case "ontimeout":
        //                         case "onreadystatechange":
        //                             return _this.addOnreadystatechangeHook(value);

        /**
         * onabort事件回调
         *
         * @param value
         */
        addOnabortHook(value) {
            const _this = this;
            return this.xhrObject.onreadystatechange = () => {
                // TODO 检查上下文是否符合条件断点

                // 跟进去下面这个函数就是处理响应体的代码逻辑了
                if (value) {
                    return value.apply(_this.xhrObject, arguments);
                } else {
                    return null;
                }
            }
        }

        /**
         * 在设置 onreadystatechange 的时候替换为自己的函数
         * @param value
         */
        addOnreadystatechangeHook(value) {
            const _this = this;
            return this.xhrObject.onreadystatechange = () => {
                try {
                    for (let xhrDebugger of xhrDebuggerArray) {
                        // 命中了这个断点
                        if (xhrDebugger.test(_this.xhrContext)) {
                            // 当前操作： XMLHttpRequest onreadystatechange
                            debugger;
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
                // 跟进去下面这个函数就是处理响应体的代码逻辑了
                if (value) {
                    return value.apply(_this.xhrObject, arguments);
                } else {
                    return null;
                }
            }
        }

        /**
         * 在设置携带凭证的时候拦截一下
         *
         * @return {undefined}
         */
        addWithCredentialsHook(value) {
            const _this = this;
            return this.xhrObject.onreadystatechange = () => {
                try {
                    for (let xhrDebugger of xhrDebuggerArray) {
                        // 命中了这个断点
                        if (xhrDebugger.test(_this.xhrContext)) {
                            debugger;
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
                // 跟进去下面这个函数就是处理响应体的代码逻辑了
                return value.apply(_this.xhrObject, arguments);
            }
        }

        /**
         * 增加访问响应头的Hook
         *
         * @param propertyName
         * @return {undefined}
         */
        addVisitResponseHeaderHook(propertyName) {
            return new Proxy(this.xhrObject[propertyName], {
                apply(target, thisArg, argArray) {

                    // TODO 打印日志

                    // TODO 断点测试
                }
            });
        }
    }

    new XMLHttpRequestPrototypeHook().hook();

    // -------------------------------------------- 控制台指令 -----------------------------------------------------------

    // TODO 2023-1-3 01:11:07 提供一个控制台接口会使用起来方便一些吗？
    // // window["CC11001100_xhr_hook"]
    // class Command {
    //
    //     init() {
    //
    //     }
    //
    //     // 列出命令帮助文档
    //     help() {
    //
    //     }
    //
    //     // 添加断点
    //     addDebugger() {
    //
    //     }
    //
    //     // 删除断点
    //     deleteDebugger() {
    //
    //     }
    //
    //     // 列出所有断点
    //     listDebugger() {
    //
    //     }
    //
    //     // 清空所有断点
    //     clearDebugger() {
    //
    //     }
    //
    // }
    //
    // new Command().init();

    // ----------------------------------------------------------------------------------------------------------------

    // const xhrDebuggerList = [
    //     {
    //         // 根据url匹配，可以是字符串或者正则，字符串的话是包含关键词，正则则是要完全匹配
    //         requestUrlFilter: "",
    //
    //         // 根据url中的请求参数名称匹配，可以是string或者正则
    //         requestParamNameFilter: "",
    //         // 根据url中的请求参数的值匹配，可以是string或者正则
    //         requestParamValueFilter: "",
    //
    //         // xhr post请求参数
    //         requestBodyFilter: "",
    //
    //         // 请求头匹配，可以是参数名
    //         requestHeaderNameFilter: "",
    //         requestHeaderValueFilter: "",
    //
    //         responseHeaderNameFilter: "",
    //         responseHeaderValueFilter: "",
    //
    //         // 当命中断点的时候如何进入断点，默认情况下是会进入两次的，一次是发送之前，一次是发送之后
    //         // 在请求发送之前进入断点
    //         enableDebuggerBeforeRequestSend: true,
    //         // 在响应接收之后进入断点
    //         enableDebuggerAfterResponseReceive: true,
    //
    //         // 根据响应体过滤
    //         responseBodyFilter: ""
    //     }
    // ]

    // 开发者工具打印的消息的字体大小
    const consoleLogFontSize = 12;

    // -------------------------------------------- --------------------------------------------------------------------

    /**
     * 用于表示一个当前正在处理的请求的相关上下文，结构化方便处理
     */
    class XMLHttpRequestContext {

        /**
         *
         * @param id {number | string}
         */
        constructor(id) {

            this.id = id;

            // 要访问的网址
            this.requestUrlString = null;

            // url中携带的参数
            this.requestParamPairMap = null;
            this.urlDecodeRequestParamPairMap = null;

            // 请求体
            this.requestBody = null;

            // 如果是提交的表单的话，表单参数是啥
            this.requestForm = null;

            // 请求头
            this.requestHeaderMap = null;

            // 设置请求头的上下文
            this.setRequestHeaderContext = {
                requestHeaderName: null, requestHeaderValue: null,
            };
            // 获取响应头的上下文
            this.getResponseHeaderContext = {
                responseHeaderName: null, responseHeaderValue: null,
            };

            // 响应体内容
            this.responseBody = null;
        }
    }

    /**
     *
     * @param requestUrlString
     * @return XMLHttpRequestContext
     */
    function parseRequestUrl(requestUrlString) {
        // // 解析querystring里传递的参数，参数的名字和值都是被URL decode之后的
        // getUrlQueryStringParams()
        // {
        //     const params = {};
        //     new URL(this.url).searchParams.forEach((value, key) => {
        //         params[key] = value;
        //     });
        //     return params;
        // }
    }

    // -------------------------------------------- --------------------------------------------------------------------

    // 每个断点都有一个唯一id
    let debuggerIdCounter = 1;

    /**
     * 用于表示一个XHR条件断点，会在符合条件的时候中断暂停程序进入断点
     */
    class XhrDebugger {

        /**
         * 一个断点是由N个条件构成的，当这些条件同时被命中时此断点生效
         *
         * @param requestUrlCondition { string | RegExp | null } 对要访问的连接过滤
         * @param requestParamNameCondition { string | RegExp | null } 对发送的请求中的参数名过滤
         * @param requestParamValueCondition { string | RegExp | null } 对发送的请求中的参数值过滤
         * @param setRequestHeaderNameCondition { string | RegExp | null } 对发送的请求中的请求头的名字过滤
         * @param setRequestHeaderValueCondition { string | RegExp | null } 对发送的请求中的请求头的值过滤
         * @param requestBodyCondition { string | RegExp | null } 按请求头过滤
         * @param getResponseHeaderNameCondition { string | RegExp | null } 对响应头的名字过滤
         * @param getResponseHeaderValueCondition { string | RegExp | null } 对响应头的值过滤
         * @param responseBodyCondition { string | RegExp | null } 按响应体过滤
         * @param enableDebuggerBeforeRequestSend  { boolean } 是否在请求发送前进入断点
         * @param enableDebuggerAfterResponseReceive { boolean } 是否在请求发送后进入断点
         */
        constructor(requestUrlCondition = null, requestParamNameCondition = null, requestParamValueCondition = null, setRequestHeaderNameCondition = null, setRequestHeaderValueCondition = null, requestBodyCondition = null, getResponseHeaderNameCondition = null, getResponseHeaderValueCondition = null, responseBodyCondition = null, enableDebuggerBeforeRequestSend = true, enableDebuggerAfterResponseReceive = true) {

            this.debuggerId = debuggerIdCounter++;

            this.requestUrlCondition = requestUrlCondition;
            this.requestParamNameCondition = requestParamNameCondition;
            this.requestParamValueCondition = requestParamValueCondition;
            this.setRequestHeaderNameCondition = setRequestHeaderNameCondition;
            this.setRequestHeaderValueCondition = setRequestHeaderValueCondition;
            this.requestBodyCondition = requestBodyCondition;

            this.getResponseHeaderNameCondition = getResponseHeaderNameCondition;
            this.getResponseHeaderValueCondition = getResponseHeaderValueCondition;
            this.responseBodyCondition = responseBodyCondition;

            this.enableDebuggerBeforeRequestSend = enableDebuggerBeforeRequestSend;
            this.enableDebuggerAfterResponseReceive = enableDebuggerAfterResponseReceive;
        }

        /**
         * 对一个请求打断点
         * @param {XMLHttpRequestContext} xhrContext
         * @return {boolean}
         */
        test(xhrContext) {
            // 计算一下要进行判断的条件有哪些 ，在test的才开始计算，这样断点就可以随便修改了
            const testConditionFunction = [];

            this.requestUrlCondition && testConditionFunction.push(this.testRequestUrlCondition);

            this.requestParamNameCondition && testConditionFunction.push(this.testRequestParamNameCondition);
            this.requestParamValueCondition && testConditionFunction.push(this.testRequestParamValueCondition);

            this.setRequestHeaderNameCondition && testConditionFunction.push(this.testSetRequestHeaderNameCondition);
            this.setRequestHeaderValueCondition && testConditionFunction.push(this.testSetRequestHeaderValueCondition);

            this.requestBodyCondition && testConditionFunction.push(this.testSetRequestBodyCondition);

            this.getResponseHeaderNameCondition && testConditionFunction.push(this.testResponseHeaderNameCondition);
            this.getResponseHeaderValueCondition && testConditionFunction.push(this.testResponseHeaderValueCondition);

            this.responseBodyCondition && testConditionFunction.push(this.testResponseBodyCondition);

            // 没有条件需要测试的话认为是未命中断点
            if (!testConditionFunction.length) {
                return false;
            }

            // 测试所有的条件，全部命中的时候才认为是命中此断点
            for (let testFunction of testConditionFunction) {
                if (!testFunction.apply(this, [xhrContext])) {
                    return false;
                }
            }
            return true;
        }

        /**
         * 判断是否需要判断请求的URL这个条件
         *
         * @param {XMLHttpRequestContext} xhrContext
         * @return {boolean}
         */
        isNeedTestRequestUrlCondition(xhrContext) {

        }

        /**
         * 请求的URL是否命中了断点
         *
         * @param {XMLHttpRequestContext} xhrRequestResponse
         */
        testRequestUrlCondition(xhrRequestResponse) {
            // 未初始化认为是命中
            if (xhrRequestResponse.requestUrlString === null) {
                return true;
            }
            return this.testCondition(this.requestUrlCondition, xhrRequestResponse.requestUrlString);
        }

        /**
         * 测试请求参数的名字
         *
         * @param {XMLHttpRequestContext} xhrContext
         */
        testRequestParamNameCondition(xhrContext) {

            // 未初始化认为是命中
            if (xhrContext.requestParamPairMap === null && xhrContext.urlDecodeRequestParamPairMap === null && xhrContext.requestForm === null) {
                return true;
            }

            // 请求的参数名，把URL编码和非URL编码的都测试一下

            // 被url编码的参数
            if (xhrContext.requestParamPairMap) {
                for (let requestParamName of xhrContext.requestParamPairMap) {
                    if (this.testCondition(this.requestParamNameCondition, requestParamName)) {
                        return true;
                    }
                }
            }
            // url解码后的参数
            if (xhrContext.urlDecodeRequestParamPairMap) {
                for (let requestParamName of xhrContext.urlDecodeRequestParamPairMap) {
                    if (this.testCondition(this.requestParamNameCondition, requestParamName)) {
                        return true;
                    }
                }
            }

            // 提交的表单参数
            if (xhrContext.requestForm) {
                // 提交的post表单的参数
                for (let [key, value] of xhrContext.requestForm) {
                    if (this.testCondition(this.requestParamNameCondition, key)) {
                        return true;
                    }
                }
            }

            // 啥都没匹配到，就算了
            return false;
        }

        /**
         *
         * @param {XMLHttpRequestContext} xhrContext
         */
        isNeedTestRequestParamValueCondition(xhrContext) {
            return this.requestParamNameCondition !== null && (xhrContext.requestParamPairMap !== null || xhrContext.urlDecodeRequestParamPairMap !== null || xhrContext.requestForm !== null);
        }

        /**
         * 测试请求参数的值
         *
         * @param {XMLHttpRequestContext} xhrContext
         */
        testRequestParamValueCondition(xhrContext) {

            // 未初始化认为是命中
            if (xhrContext.requestParamPairMap === null && xhrContext.urlDecodeRequestParamPairMap === null && xhrContext.requestForm === null) {
                return true;
            }

            // 请求的参数名，把URL编码和非URL编码的都测试一下

            // 被url编码的参数
            if (xhrContext.requestParamPairMap) {
                for (let [key, value] of xhrContext.requestParamPairMap) {
                    if (this.testCondition(this.requestParamNameCondition, value)) {
                        return true;
                    }
                }
            }
            // url解码后的参数
            if (xhrContext.urlDecodeRequestParamPairMap) {
                for (let [key, value] of xhrContext.urlDecodeRequestParamPairMap) {
                    if (this.testCondition(this.requestParamNameCondition, value)) {
                        return true;
                    }
                }
            }

            // 提交的表单参数
            if (xhrContext.requestForm) {
                // 提交的post表单的参数
                for (let [key, value] of xhrContext.requestForm) {
                    if (this.testCondition(this.requestParamNameCondition, value)) {
                        return true;
                    }
                }
            }

            // 啥都没匹配到，就算了
            return false;
        }

        /**
         *
         * @param xhrContext
         * @return {false|*|boolean}
         */
        isNeedTestSetRequestHeaderNameCondition(xhrContext) {
            return this.setRequestHeaderNameCondition != null && xhrContext.setRequestHeaderContext && xhrContext.setRequestHeaderContext.requestHeaderName !== null;
        }

        /**
         * 测试设置请求头的name是否命中了断点
         *
         * @param {XMLHttpRequestContext} xhrContext
         */
        testSetRequestHeaderNameCondition(xhrContext) {
            return this.testCondition(this.setRequestHeaderNameCondition, xhrContext.setRequestHeaderContext.requestHeaderName);
        }

        /**
         * 判断是否需要测试请求头的值这个条件
         *
         * @param {XMLHttpRequestContext} xhrContext
         * @return {boolean}
         */
        isNeedTestSetRequestHeaderValueCondition(xhrContext) {
            return this.setRequestHeaderValueCondition !== null && xhrContext.setRequestHeaderContext.requestHeaderValue !== null;
        }

        /**
         * 测试设置请求头的value是否命中了断点
         *
         * @param {XMLHttpRequestContext} xhrContext
         */
        testSetRequestHeaderValueCondition(xhrContext) {
            return this.testCondition(this.setRequestHeaderValueCondition, xhrContext.setRequestHeaderContext.requestHeaderValue);
        }

        /**
         * 是否需要测试请求体
         *
         * @param {XMLHttpRequestContext} xhrContext
         * @return {boolean}
         */
        isNeedTestSetRequestBodyCondition(xhrContext) {
            return this.requestBodyCondition != null && xhrContext.requestBody !== null;
        }

        /**
         * 测试设置请求体的时候是否进入断点
         *
         * @param {XMLHttpRequestContext} xhrContext
         * @return {boolean}
         */
        testSetRequestBodyCondition(xhrContext) {
            return this.testCondition(this.requestBodyCondition, xhrContext.requestBody);
        }

        /**
         *
         * 是否需要测试获取响应头名字这个条件
         *
         * @param {XMLHttpRequestContext} xhrContext
         * @return {boolean}
         */
        isNeedTestResponseHeaderNameCondition(xhrContext) {
            return this.getResponseHeaderNameCondition !== null && xhrContext.getResponseHeaderContext.responseHeaderName !== null;
        }

        /**
         * 测试获取响应头的名字
         *
         * @param {XMLHttpRequestContext} xhrContext
         * @return {boolean}
         */
        testResponseHeaderNameCondition(xhrContext) {
            return this.testCondition(this.getResponseHeaderNameCondition, xhrContext.getResponseHeaderContext.responseHeaderName);
        }

        /**
         * 是否需要测试响应头的值
         *
         * @param {XMLHttpRequestContext} xhrContext
         * @return {boolean}
         */
        isNeedTestResponseHeaderValueCondition(xhrContext) {
            return this.getResponseHeaderValueCondition !== null && xhrContext.getResponseHeaderContext && xhrContext.getResponseHeaderContext.responseHeaderValue != null;
        }

        /**
         * 测试获取响应头的值
         *
         * @param {XMLHttpRequestContext} xhrContext
         * @return {boolean}
         */
        testResponseHeaderValueCondition(xhrContext) {
            return this.testCondition(this.getResponseHeaderValueCondition, xhrContext.getResponseHeaderContext.responseHeaderValue);
        }

        /**
         * 判断是否需要测试响应体的条件
         *
         * @param {XMLHttpRequestContext} xhrContext
         * @return {boolean}
         */
        isNeedTestResponseBodyCondition(xhrContext) {
            return this.responseBodyCondition !== null && xhrContext.responseBody !== null;
        }

        /**
         * 测试响应体
         *
         * @param {XMLHttpRequestContext} xhrContext
         */
        testResponseBodyCondition(xhrContext) {
            return this.testCondition(this.responseBodyCondition, xhrContext.responseBody);
        }

        /**
         * 测试断点条件是否命中
         *
         * @param {string | RegExp | null} filter
         * @param {string | RegExp | null} stringValue
         * @return {boolean}
         */
        testCondition(filter, stringValue) {
            if (!filter || !stringValue) {
                return false;
            } else if (typeof filter === "string") {
                return filter.indexOf(stringValue) !== -1;
            } else if (filter instanceof RegExp) {
                return filter.test(stringValue);
            } else {
                return false;
            }
        }

    }

    // 把xhrDebuggerArray转换为内部使用的格式
    const newXhrDebuggerArray = [];
    for (let xhrDebugger of xhrDebuggerArray) {
        newXhrDebuggerArray.push(new XhrDebugger(
            xhrDebugger["requestUrlCondition"],
            xhrDebugger["requestParamNameCondition"],
            xhrDebugger["requestParamValueCondition"],
            xhrDebugger["setRequestHeaderNameCondition"],
            xhrDebugger["setRequestHeaderValueCondition"],
            xhrDebugger["requestBodyCondition"],
            xhrDebugger["getResponseHeaderNameCondition"],
            xhrDebugger["getResponseHeaderValueCondition"],
            xhrDebugger["responseBodyCondition"],
            xhrDebugger["enableDebuggerBeforeRequestSend"],
            xhrDebugger["enableDebuggerAfterResponseReceive"],
        ));
    }
    while (xhrDebuggerArray.length) {
        xhrDebuggerArray.pop();
    }
    for (let xhrDebugger of newXhrDebuggerArray) {
        xhrDebuggerArray.push(xhrDebugger);
    }

    // ------------------------------------------ 通用工具类 ------------------------------------------------------------

    /**
     * 获取当前时间
     *
     * @return {string}
     */
    function now() {
        const now = new Date();
        return "[" + stringAlignRight(now.getFullYear(), 4, "0") + "-" + stringAlignRight(now.getMonth() + 1, 2, "0") + "-" + stringAlignRight(now.getDate(), 2, "0") + " " + stringAlignRight(now.getHours(), 2, "0") + ":" + stringAlignRight(now.getMinutes(), 2, "0") + ":" + stringAlignRight(now.getSeconds(), 2, "0") + "." + stringAlignRight(now.getMilliseconds(), 3, "0") + "]";
    }

    /**
     * 把字符串右对齐到指定的长度，长度不足时使用给定的字符填充左边
     *
     * @param s { any } 要对齐的字符串
     * @param length { number} 要对齐到的长度
     * @param c { string } 长度不足时用什么字符补齐
     * @return { string }
     */
    function stringAlignRight(s, length, c) {
        s = s + "";
        while (s.length < length) {
            s = c + s;
        }
        return s;
    }

    /**
     *
     * @param messageAndStyleArray
     * @returns {string}
     */
    function genFormatArray(messageAndStyleArray) {
        const formatArray = [];
        for (let i = 0, end = messageAndStyleArray.length / 2; i < end; i++) {
            formatArray.push("%c%s");
        }
        return formatArray.join("");
    }

    /**
     * 获取事件触发的代码的位置
     *
     * @returns {string}
     */
    function cc11001100_getCodeLocation() {
        const callstack = new Error().stack.split("\n");
        while (callstack.length && callstack[0].indexOf("cc11001100_getCodeLocation") === -1) {
            callstack.shift();
        }
        callstack.shift();
        callstack.shift();

        return callstack[0].trim();
    }


})();
