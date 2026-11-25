// ==UserScript==
// @name         FixUpX
// @namespace    https://github.com/mstudio45
// @version      v1.0.0
// @description  Copies FxTwitter URL instead of the original URL with tracking parameters.
// @author       mstudio45
// @match        https://x.com/*
// @icon         https://abs.twimg.com/favicons/twitter.3.ico
// @updateURL    https://github.com/mstudio45/fixupx-tweet-copy/raw/refs/heads/main/script.user.js
// @downloadURL  https://github.com/mstudio45/fixupx-tweet-copy/raw/refs/heads/main/script.user.js
// @run-at       document-start
// ==/UserScript==

(function() {
    const moveSendViaChat = true;
    let lastTrigger = null;

    function saveTrigger(target) {
        if (!target || !target.closest) return;

        const trigger = target.closest('[aria-haspopup="menu"], [data-testid="share"], [data-testid="caret"]');
        if (!trigger) return;

        lastTrigger = trigger;
    }

    function toFixupUrl(text) {
        if (typeof text !== "string") return text;

        const trimmed = text.trim();
        const match = trimmed.match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/);
        if (!match) return text;

        return "https://fixupx.com/" + match[1] + "/status/" + match[2];
    }

    const originalWriteText = Clipboard.prototype.writeText;
    Clipboard.prototype.writeText = function(text) {
        return originalWriteText.call(this, toFixupUrl(text));
    };

    const originalWrite = Clipboard.prototype.write;
    Clipboard.prototype.write = async function(items) {
        const newItems = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.types.includes("text/plain")) {
                newItems.push(item);
                continue;
            }

            const blob = await item.getType("text/plain");
            const text = await blob.text();
            const fixed = toFixupUrl(text);
            if (fixed === text) {
                newItems.push(item);
                continue;
            }

            newItems.push(new ClipboardItem({ "text/plain": new Blob([fixed], { type: "text/plain" }) }));
        }

        return originalWrite.call(this, newItems);
    };

    document.addEventListener("copy", (event) => {
        const active = document.activeElement;
        let text = "";

        if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) {
            text = active.value.substring(active.selectionStart, active.selectionEnd);
        } else {
            text = window.getSelection().toString();
        }

        const fixed = toFixupUrl(text);
        if (fixed === text) return;

        event.clipboardData.setData("text/plain", fixed);
        event.preventDefault();
    }, true);

    document.addEventListener("pointerdown", (event) => {
        saveTrigger(event.target);
    }, true);

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;

        saveTrigger(event.target);
    }, true);

    function findMenuItem(label) {
        const target = label.toLowerCase();
        const menuItems = document.querySelectorAll('[role="menuitem"]');

        for (let i = 0; i < menuItems.length; i++) {
            const menuItem = menuItems[i];
            if (menuItem.textContent.trim().toLowerCase() === target) return menuItem;

            const children = menuItem.querySelectorAll("div, span");
            for (let j = 0; j < children.length; j++) {
                const child = children[j];
                if (child.childElementCount !== 0) continue;
                if (child.textContent.trim().toLowerCase() === target) return menuItem;
            }
        }

        return null;
    }

    function getTweetFromPoint(menuItem) {
        const rect = menuItem.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const pointerEvents = menuItem.style.pointerEvents;
        menuItem.style.pointerEvents = "none";

        const elements = document.elementsFromPoint(x, y);
        menuItem.style.pointerEvents = pointerEvents;

        return elements.find(el => el.tagName === "ARTICLE" || (el.dataset.href && el.dataset.href.includes("/status/"))) || null;
    }

    function getTweet(menuItem) {
        if (!menuItem) return null;

        if (lastTrigger && lastTrigger.isConnected) {
            const tweet = lastTrigger.closest("article");
            if (tweet) return tweet;
        }

        return getTweetFromPoint(menuItem);
    }

    function moveChatButton() {
        if (!moveSendViaChat) return;

        const menuItem = findMenuItem("Send via Chat");
        if (!menuItem) return;
        if (menuItem.getAttribute("data-moved") === "true") return;

        menuItem.parentElement.append(menuItem);
        menuItem.setAttribute("data-moved", "true");
    }

    function update() {
        moveChatButton();

        const menuItem = findMenuItem("Copy link");
        if (!menuItem) return;

        const tweet = getTweet(menuItem);
        if (!tweet) return;

        const redirect = tweet.querySelector('a[href*="/status/"]');
        const href = window.location.href.includes("/status/") ? window.location.href : redirect && redirect.href;
        if (!href) return;

        const url = href
            .replace(/\/status\/(\d+).*/, "/status/$1")
            .replace("twitter.com", "fixupx.com")
            .replace("x.com", "fixupx.com");

        menuItem.onclick = (event) => {
            event.preventDefault();

            setTimeout(function() {
                navigator.clipboard.writeText(url).then(() => {}, (error) => {
                    alert("Failed to copy URL to clipboard: " + error.toString());
                });
            }, 100);
        };
    }

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();