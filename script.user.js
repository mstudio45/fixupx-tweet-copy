// ==UserScript==
// @name         FixUpX
// @namespace    https://github.com/mstudio45
// @version      v1.0.1
// @description  Copies FxTwitter URL instead of the original URL with tracking parameters.
// @author       mstudio45
// @match        https://x.com/*
// @icon         https://abs.twimg.com/favicons/twitter.3.ico
// @updateURL    https://github.com/mstudio45/fixupx-tweet-copy/raw/refs/heads/main/script.user.js
// @downloadURL  https://github.com/mstudio45/fixupx-tweet-copy/raw/refs/heads/main/script.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
    const CONFIG = {
        moveSendViaChat: GM_getValue("moveSendViaChat", true)
    };

    function updateValue(key, value) {
        GM_setValue(key, value);
        window.location.reload();
    }

    GM_registerMenuCommand(`[${CONFIG.moveSendViaChat ? "✅" : "❌"}] Move "Send via Chat" to the bottom`, () => {
        updateValue("moveSendViaChat", !CONFIG.moveSendViaChat);
    });

    // variables //
    const MEDIA_COPY_LABELS = ["copy gif address", "copy video address", "copy link at current time", "copy photo link"];
    let lastTrigger = null;

    // url handlers //
    function findMenuItem(label) {
        const target = label.toLowerCase();
        for (const menuItem of document.querySelectorAll('[role="menuitem"]')) {
            if (menuItem.textContent.trim().toLowerCase() === target)
                return menuItem;
        }

        return null;
    }

    function fixTweetUrl(text) {
        if (typeof text !== "string") return text;

        const match = text.trim().match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/);
        if (!match) return text;

        return "https://fixupx.com/" + match[1] + "/status/" + match[2];
    }

    function getTweetUrl(trigger) {
        if (window.location.href.includes("/status/")) return fixTweetUrl(window.location.href);

        const tweet = trigger && trigger.closest("article");
        const statusLink = tweet && tweet.querySelector('a[href*="/status/"]');
        return statusLink ? fixTweetUrl(statusLink.href) : null;
    }

    function getMediaUrl(trigger) {
        const scope = trigger?.closest("article, [aria-modal='true']") || document;

        const gif = scope.querySelector('video[poster*="tweet_video_thumb/"]')?.getAttribute("poster").match(/tweet_video_thumb\/([^./?#]+)/);
        if (gif) return "https://gif.fxtwitter.com/tweet_video/" + gif[1] + ".webp";

        const player = scope.querySelector("video")?.parentElement;
        for (let fiber = player?.[Object.keys(player).find((key) => key.startsWith("__reactFiber$"))]; fiber; fiber = fiber.return) {
            if (fiber.memoizedProps?.progressiveSrc) return "https://api.fxtwitter.com/2/go?url=" + encodeURIComponent(fiber.memoizedProps.progressiveSrc) + (new URLSearchParams(window.location.search).has("t") ? "#t=" + new URLSearchParams(window.location.search).get("t") : "");
        }

        const image = scope.querySelector('img[alt="Image"][src*="pbs.twimg.com/media/"]')?.getAttribute("src").match(/pbs\.twimg\.com\/media\/([^?#]+)\?format=(\w+)/);
        if (image) return "https://pbs.twimg.com/media/" + image[1] + "." + image[2];

        return getTweetUrl(trigger);
    }

    // chat button handler //
    function moveChatButton() {
        if (!CONFIG.moveSendViaChat) return;

        const chatItem = findMenuItem("Send via Chat");
        if (chatItem && chatItem.getAttribute("data-moved") !== "true") {
            chatItem.parentElement.parentElement.append(chatItem.parentElement);
            chatItem.setAttribute("data-moved", "true");
        }
    }

    // clipboard hooks //
    const Clipboard = unsafeWindow.Clipboard;
    const originalWriteText = Clipboard.prototype.writeText;
    Clipboard.prototype.writeText = function(text) {
        return originalWriteText.call(this, fixTweetUrl(text));
    };

    const originalWrite = Clipboard.prototype.write;
    Clipboard.prototype.write = async function(items) {
        return originalWrite.call(this, await Promise.all([...items].map(async (item) => {
            const text = item.types.includes("text/plain") && await (await item.getType("text/plain")).text();
            return text && fixTweetUrl(text) !== text ? new ClipboardItem({ "text/plain": new Blob([fixTweetUrl(text)], { type: "text/plain" }) }) : item;
        })));
    };

    document.addEventListener("copy", (event) => {
        const active = document.activeElement;
        const text = ["TEXTAREA", "INPUT"].includes(active?.tagName) ? active.value.substring(active.selectionStart, active.selectionEnd) : window.getSelection().toString();
        if (fixTweetUrl(text) === text) return;

        event.clipboardData.setData("text/plain", fixTweetUrl(text));
        event.preventDefault();
    }, true);

    // menu handlers //
    for (const type of ["pointerdown", "keydown"]) {
        document.addEventListener(type, (event) => {
            lastTrigger = event.target.closest?.('[aria-haspopup="menu"], [data-testid="share"], [data-testid="caret"], [data-slot="xds-context-menu-trigger"]') || lastTrigger;
        }, true);
    }

    window.addEventListener("click", (event) => {
        const label = event.target.closest?.('[role="menuitem"]')?.textContent.trim().toLowerCase();
        const url = MEDIA_COPY_LABELS.includes(label) ? getMediaUrl(lastTrigger) : label === "copy link" ? getTweetUrl(lastTrigger) : null;
        if (!url) return;

        setTimeout(() => navigator.clipboard.writeText(url).catch((error) => alert("Failed to copy URL to clipboard: " + error)), 100);
    }, true);

    // observers //
    new MutationObserver(moveChatButton).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();