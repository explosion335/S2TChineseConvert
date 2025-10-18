// ==UserScript==
// @name         S2TChineseConvert
// @namespace    S2TChineseConvert
// @version      0.1
// @description  繁簡轉換
// @match        *://*/*
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @connect      cdn.jsdelivr.net
// @run-at       document-end
// @resource     zh2hant https://cdn.jsdelivr.net/gh/explosion335/jsdeliver@main/mw_zh2hant.txt
// @resource     zh2hk   https://cdn.jsdelivr.net/gh/explosion335/jsdeliver@main/mw_zh2hk.txt
// ==/UserScript==

(async function(){
    'use strict';

    const resources = [
        GM_getResourceText('zh2hant'),
        GM_getResourceText('zh2hk')
    ];

    const SKIP_TAGS = new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','IFRAME','CODE','PRE','NOSCRIPT']);
    function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
    function parse(txt){
        const out = [];
        for (const raw of txt.split(/\r?\n/)){
            const line = raw.trim();
            if(!line || line.startsWith('#')) continue;
            const parts = raw.split('\t');
            if(parts.length >= 2){
                const from = parts[0].trim();
                const to = parts.slice(1).join('\t').trim();
                if(from) out.push({from, to});
            } else {
                const p2 = raw.split(/\s+/);
                if(p2.length >= 2){
                    const from = p2[0].trim();
                    const to = p2.slice(1).join(' ').trim();
                    if(from) out.push({from, to});
                }
            }
        }
        out.sort((a,b)=>b.from.length - a.from.length);
        return out;
    }
    function buildReplacer(entries){
        if(!entries || entries.length === 0) return s => s;
        const normalized = entries.map(e => ({from: e.from.normalize('NFC'), to: e.to}));
        const escaped = normalized.map(e => escapeRe(e.from));
        const re = new RegExp(escaped.join('|'),'gu');
        const map = new Map(normalized.map(e => [e.from, e.to]));
        return function(text){
            if(!text) return text;
            const n = text.normalize('NFC');
            return n.replace(re, m => map.get(m) ?? m);
        };
    }
    function walkAndReplace(root, replacer){
        if(!root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node){
                if(!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                let el = node.parentNode;
                while(el && el.nodeType === 1){
                    if(SKIP_TAGS.has(el.tagName) || el.isContentEditable) return NodeFilter.FILTER_REJECT;
                    el = el.parentNode;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const nodes = [];
        while(walker.nextNode()) nodes.push(walker.currentNode);
        for(const n of nodes){
            try{
                const oldVal = n.nodeValue;
                const newVal = replacer(oldVal);
                if(newVal !== oldVal) n.nodeValue = newVal;
            }catch(e){}
        }
    }
    function replaceAttrsInElement(el, replacer){
        if(!el || el.nodeType !== 1) return;
        if(SKIP_TAGS.has(el.tagName)) return;
        if(el.isContentEditable) return;
        const ATTRS = ['title','alt','placeholder','aria-label'];
        for(const a of ATTRS){
            if(el.hasAttribute(a)){
                const v = el.getAttribute(a);
                if(v){
                    const nv = replacer(v);
                    if(nv !== v) el.setAttribute(a, nv);
                }
            }
        }
        if(el.hasAttribute('value') && !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')){
            const v = el.getAttribute('value');
            if(v){
                const nv = replacer(v);
                if(nv !== v) el.setAttribute('value', nv);
            }
        }
    }
    function applyAttributesWhole(replacer){
        const all = document.querySelectorAll('body, body *');
        for(const el of all) replaceAttrsInElement(el, replacer);
    }
    function observe(replacer){
        const mo = new MutationObserver(muts=>{
            for(const m of muts){
                for(const node of m.addedNodes || []){
                    if(node.nodeType === Node.TEXT_NODE){
                        const p = node.parentNode;
                        if(!p || SKIP_TAGS.has(p.tagName) || p.isContentEditable) continue;
                        const t = node.nodeValue;
                        const r = replacer(t);
                        if(r !== t) node.nodeValue = r;
                    } else if(node.nodeType === Node.ELEMENT_NODE){
                        if(!SKIP_TAGS.has(node.tagName) && !node.isContentEditable){
                            walkAndReplace(node, replacer);
                            node.querySelectorAll('*').forEach(el=>replaceAttrsInElement(el, replacer));
                        }
                    }
                }
                if(m.type === 'characterData' && m.target && m.target.nodeType === Node.TEXT_NODE){
                    const tnode = m.target, p = tnode.parentNode;
                    if(p && !SKIP_TAGS.has(p.tagName) && !p.isContentEditable){
                        const nv = replacer(tnode.nodeValue);
                        if(nv !== tnode.nodeValue) tnode.nodeValue = nv;
                    }
                }
            }
        });
        mo.observe(document.documentElement || document.body, {childList: true, subtree: true, characterData: true});
    }

    try{
        const entries = resources.flatMap(t=>parse(t));
        const replacer = buildReplacer(entries);
        if(document.readyState === 'loading')
            await new Promise(r=>document.addEventListener('DOMContentLoaded', r, {once:true}));
        walkAndReplace(document.body, replacer);
        if(document.title) document.title = replacer(document.title);
        applyAttributesWhole(replacer);
        observe(replacer);
    }catch(err){
        console.error('Replacer load error', err);
    }
})();
