/**
 * Claudia's Community — AI Commission Helper Widget
 * ---------------------------------------------------
 * Drop this near the end of your <body>:
 *   <script src="/js/autheria-chatbot-widget.js"></script>
 *
 * Talks to your Netlify function at /.netlify/functions/chat,
 * which holds the Gemini API key server-side. If that is
 * unavailable, it falls back to built-in keyword answers so the
 * widget never looks broken to a visitor.
 *
 * Self-contained: styles live in a shadow root and cannot clash
 * with your site's CSS. No dependencies, no build step.
 */
(function () {
  "use strict";

  const CONFIG = {
    brandName: "Claudia's Community",
    mascot: "\u{1F43E}",
    mascotImage: "assets/images/wildcut-logo-transparent.png",
    endpoint: "/.netlify/functions/chat",
    greeting:
      "Hiii, welcome to Claudia's Community! I'm the commission helper \u2014 ask me about pricing, turnaround, how to order, or tell me you're stuck for ideas and I'll help you think of something. What's on your mind?",
    email: "claudiaartwork3@gmail.com",
    links: {
      commissionForm: "#cta",
      pricing: "#pricing",
      gallery: "#gallery",
      faq: "#faq",
      howItWorks: "#how-it-works",
      payments: "#payments",
      discord: "https://discord.gg/s4yKc3pquJ",
    },
    quickReplies: [
      "How much does a commission cost?",
      "How long does it take?",
      "How do I order?",
      "What's the difference between the tiers?",
      "What payment methods do you take?",
      "I don't know what to commission",
    ],
    maxHistory: 12,
  };

  // --- Offline FAQ ------------------------------------------------
  // Used when the API is unreachable OR rate-limited (the free Gemini
  // tier runs out), so the widget still answers properly instead of
  // shrugging. Matching is scored, not first-hit: the entry with the
  // most specific keyword overlap wins.
  //
  // "defer: true" entries are questions the SITE DOES NOT ANSWER. They
  // deliberately hand off to a human instead of guessing a policy.
  const FORM = { label: "Open commission form", href: CONFIG.links.commissionForm };
  const DISCORD = { label: "Join our Discord", href: CONFIG.links.discord };

  const FAQ = [
    // ---------- pricing & tiers ----------
    { k: ["how much", "price", "pricing", "cost", "expensive", "cheap", "rate", "quote", "budget"],
      a: "There's no fixed price list \u2014 pricing depends on how detailed and complex the piece is. Work is grouped into Basic, Medium and Premium tiers, and you get a personal quote back once you send your idea through the commission form.",
      link: FORM },
    { k: ["tier", "basic", "medium", "premium", "difference between", "which tier", "package"],
      a: "Basic is a single character with clean linework and flat or simple shading \u2014 great for icons. Medium is a full rendered illustration with simple background or scene elements, and multiple expressions if you want an emote pack. Premium is a fully rendered illustration or 3D asset with complex scenes or multiple characters, plus priority revisions.",
      link: { label: "See the tiers", href: CONFIG.links.pricing } },
    { k: ["free", "discount", "sale", "cheaper"],
      a: "Quotes are worked out per piece rather than from a set list, so the best move is to send your idea and your budget through the form \u2014 mentioning a budget genuinely helps shape the scope to fit it.",
      link: FORM },

    // ---------- timing ----------
    { k: ["how long", "turnaround", "wait", "eta", "deadline", "when will", "delivery time", "fast", "speed"],
      a: "Basic and Medium pieces usually take 2\u20133 weeks. Premium takes longer since the scope varies a lot more \u2014 it gets scoped per project when you get your quote.",
      link: FORM },
    { k: ["queue", "slot", "waitlist", "spot", "available", "open", "booked", "taking commissions"],
      a: "A 25\u201350% deposit is what reserves your slot in the queue, and rendering starts once it clears. For how busy the queue is right this second, Discord is the fastest place to ask.",
      link: DISCORD },

    // ---------- ordering ----------
    { k: ["order", "buy", "purchase", "commission form", "how do i start", "get started", "request", "book", "hire"],
      a: "Fill out the commission form at the bottom of the site \u2014 it asks for your name, email, commission type, an optional budget, a description of the character, and a link to any reference images. You'll get a rough sketch and a scope back before anything is finalised.",
      link: FORM },
    { k: ["reference", "ref sheet", "upload", "attach", "send image", "send picture", "file upload",
          "google drive", "drive link", "pinterest", "imgur", "send a link", "send you"],
      a: "The reference field takes a pasted link rather than a file upload \u2014 a Google Drive, Pinterest, Twitter or imgur link all work fine. Paste several separated by commas if you have more than one.",
      link: FORM },
    { k: ["what do you need", "what should i include", "information", "details needed"],
      a: "Name and email, which commission type you want, an optional budget, a description of the character (species, colours, markings, personality, anything special), and reference links if you have them. That's enough to come back with a scope and quote.",
      link: FORM },

    // ---------- process ----------
    { k: ["process", "how does it work", "steps", "what happens", "workflow"],
      a: "Four steps: you share your idea and references and get a rough sketch plus a scope back; a 25\u201350% deposit reserves your queue slot; you review the sketch and flag changes before final rendering; then you approve the final preview, pay the balance, and get the high-res files.",
      link: { label: "See how it works", href: CONFIG.links.howItWorks } },
    { k: ["sketch", "wip", "progress", "draft", "preview"],
      a: "Every commission starts with a sketch pass, so you always see the rough version first and can flag changes before final rendering begins. Nothing gets finalised without your OK \u2728",
      link: { label: "See how it works", href: CONFIG.links.howItWorks } },
    { k: ["revision", "change", "edit", "adjust", "redo", "fix", "not happy"],
      a: "The sketch stage is where changes get flagged, before final rendering starts \u2014 that's deliberately early so nothing expensive has been built yet. Premium tier also includes priority revisions.",
      link: { label: "See how it works", href: CONFIG.links.howItWorks } },

    // ---------- payment ----------
    { k: ["pay", "payment", "paypal", "ko-fi", "kofi", "card", "checkout", "invoice"],
      a: "PayPal and Ko-fi are the main options, and other methods are available on request. Every PayPal invoice has Buyer Protection, you don't need a PayPal account to pay by card, and card details are never stored on the site.",
      link: { label: "Payment details", href: CONFIG.links.payments } },
    { k: ["deposit", "how much deposit", "upfront", "down payment", "advance"],
      a: "A 25\u201350% deposit reserves your slot in the queue, and sketch work starts once it clears. It's a percentage rather than a set amount, since the base price varies by piece.",
      link: { label: "Payment details", href: CONFIG.links.payments } },
    { k: ["remaining", "balance", "rest of", "final payment", "when do i pay"],
      a: "The remaining balance is due after you've seen and approved the final preview \u2014 and it's paid before the high-resolution files are handed over.",
      link: { label: "Payment details", href: CONFIG.links.payments } },
    { k: ["refund", "cancel", "change my mind", "back out", "money back"],
      a: "Deposits are fully refundable as long as sketch work hasn't started yet. Once work is underway, refunds are handled case by case \u2014 email us directly and we'll sort out something fair.",
      link: { label: "Email us", href: "mailto:" + CONFIG.email } },

    // ---------- rights ----------
    { k: ["commercial", "merch", "sell", "usage rights", "license", "business", "brand", "logo use"],
      a: "Personal use is included by default on every tier. Commercial or brand use \u2014 mascots, logos, merch \u2014 can be arranged; just mention what you plan to use it for in the commission form so it's priced in.",
      link: FORM },
    { k: ["credit", "tag you", "repost"],
      a: "Credit is always appreciated! For anything beyond personal use it's worth flagging your intended use in the form so it's covered properly.",
      link: FORM },

    // ---------- what we make ----------
    { k: ["what do you make", "what do you offer", "services", "types", "what can you do", "what kind"],
      a: "Six kinds of commissions: PFPs & banners, 3D models, streaming assets & emotes, character art, animation, and couple art. Everything is digital \u2014 no fursuits or physical products.",
      link: { label: "See the work", href: CONFIG.links.gallery } },
    { k: ["3d", "model", "render", "blender", "bust", "prop", "weapon", "sculpt"],
      a: "3D covers stylized character busts, full models, and prop or weapon renders, built from your reference or concept art. Turntable and preview renders are available on request.",
      link: { label: "See 3D work", href: "#more-work" } },
    { k: ["emote", "twitch", "vtuber", "stream", "overlay", "panel", "sub badge"],
      a: "Streaming work covers VTuber assets, Discord/Twitch emote packs, stream overlays and panels \u2014 all sized correctly for each platform, and emote packs come with matched expressions.",
      link: { label: "See streaming work", href: "#more-work" } },
    { k: ["pfp", "profile picture", "avatar", "banner", "header", "icon"],
      a: "PFPs and banners get sized and cropped for exactly where you'll use them \u2014 Discord, Twitch or socials. The designs are built to stay legible at thumbnail size, and matching PFP + banner sets are a popular combo.",
      link: FORM },
    { k: ["animation", "animated", "loop", "idle", "gif", "motion"],
      a: "Animation covers short idle and loop animations plus animated emote sets. There's a motion and rigging reel in the 3D & More section if you want to see the range.",
      link: { label: "See animation work", href: "#more-work" } },
    { k: ["couple", "two characters", "ship", "duo", "partner", "friends"],
      a: "Couple art is illustrations featuring two characters together \u2014 ships, duos, that kind of thing. It sits in the more detailed tiers since there are two characters to render.",
      link: FORM },
    { k: ["character art", "oc", "illustration", "full body", "character sheet", "portrait"],
      a: "Character art covers full-body illustrations, character sheets and fan art \u2014 anywhere from a quick sketch to a fully rendered scene, with background and scene work available.",
      link: { label: "See character work", href: CONFIG.links.gallery } },
    { k: ["mascot"],
      a: "Mascot and logo-style character work is definitely in range \u2014 since it's usually for a brand, mention the intended use in the form so commercial usage gets included.",
      link: FORM },
    { k: ["fursuit", "physical", "print", "shipping", "sticker", "poster"],
      a: "Everything we deliver is digital \u2014 no fursuits or physical products. You get high-resolution files, and what you do with them from there is up to you.",
      link: FORM },

    // ---------- contact ----------
    { k: ["contact", "email", "reach", "talk to", "message", "get in touch", "support"],
      a: "Discord is fastest for quick questions. For email it's " + CONFIG.email + ".",
      link: DISCORD },
    { k: ["discord", "server", "community"],
      a: "The Discord is the fastest place to reach us \u2014 quick questions, updates and work in progress all live there. Come say hi!",
      link: DISCORD },
    { k: ["claudia", "who runs", "who are you", "about you", "owner", "autheria"],
      a: "Claudia's Community is run by Claudia, the artist behind the studio. You can reach her at " + CONFIG.email + " or @Cozy_Claudia on X.",
      link: DISCORD },
    { k: ["instagram", "twitter", "socials", "portfolio", "x.com", "follow", "gallery"],
      a: "Instagram is @autherias_community for finished pieces and behind the scenes, X is @Cozy_Claudia, and the full portfolio lives at autheria.my.canva.site.",
      link: { label: "See the gallery", href: CONFIG.links.gallery } },
    { k: ["experience", "how long have you", "years", "many commissions", "how many"],
      a: "68+ projects delivered and around 7 years of studio experience so far \u2014 there's a good spread of it in the portfolio if you want to see the range.",
      link: { label: "See the work", href: CONFIG.links.gallery } },

    // ---------- reviews ----------
    { k: ["review", "testimonial", "feedback", "rating", "trust", "legit", "scam", "safe"],
      a: "Reviews go up live on the site the moment clients submit them \u2014 have a look at the Reviews section for the current ones and the running average. Every PayPal invoice also carries Buyer Protection.",
      link: { label: "See reviews", href: "#reviews" } },
    { k: ["leave a review", "write a review", "rate you"],
      a: "There's a \"Share your experience\" box in the Reviews section \u2014 pick a star rating, write a line or two, and it appears on the page right away. It genuinely helps us out \ud83d\udc96",
      link: { label: "Leave a review", href: "#reviews" } },

    // ---------- ideas ----------
    { k: ["idea", "stuck", "inspiration", "no idea", "suggestion", "don't know what", "dont know what",
          "what to commission", "what should i get", "help me decide", "recommend", "not sure what"],
      a: "Try building it from three pieces: WHO (your OC, VTuber persona, D&D character), WHAT they're doing (cozy mug-in-hand, action pose, chibi wave), and WHERE it'll live (PFP, banner, emote set). Pick one of each and you've basically got a brief. What kind of character do you have in mind?" },

    // ---------- small talk ----------
    { k: ["hi", "hello", "hey", "yo", "sup", "good morning", "good evening"],
      a: "Hey! \ud83d\udc4b Ask me about pricing, turnaround, how ordering works, or tell me you're stuck for ideas and I'll help you think of something." },
    { k: ["thank", "thanks", "ty", "appreciate", "cheers"],
      a: "Anytime! If you're ready to send something over, the commission form is the place \u2014 or drop into the Discord for a quicker chat.",
      link: FORM },
    { k: ["are you a bot", "are you human", "real person", "ai", "robot"],
      a: "I'm the studio's assistant bot \u2014 handy for the common questions, but a real person is only a message away on Discord or by email.",
      link: DISCORD },

    // ---------- deliberate hand-offs (site states no policy) ----------
    { k: ["nsfw", "mature", "adult", "suggestive", "lewd", "explicit", "18+"],
      a: "I don't want to give you a wrong answer on that one \u2014 it's worth asking directly. Discord is fastest, or email " + CONFIG.email + ".",
      link: DISCORD, defer: true },
    { k: ["fan art", "fanart", "copyrighted", "existing character", "anime character"],
      a: "There's fan art in the portfolio, but I'd rather not promise what's accepted for a specific character \u2014 ask on Discord or by email and you'll get a proper answer.",
      link: DISCORD, defer: true },
    { k: ["psd", "source file", "layered", "project file", "blend file", "clip file", "raw file"],
      a: "I'm not certain what's included on source files, and I'd rather not guess \u2014 ask on Discord or by email and you'll get a definite answer.",
      link: DISCORD, defer: true },
    { k: ["file format", "format", "formats", "resolution", "png", "jpg", "fbx", "obj", "dpi",
          "what files", "deliver", "delivered"],
      a: "You get high-resolution files in the format you need at delivery, but I don't want to promise specific formats or resolutions \u2014 worth confirming on Discord or by email.",
      link: DISCORD, defer: true },
    { k: ["rig", "rigging", "live2d", "rigged", "vtube studio"],
      a: "There's rigging work in the portfolio reel, but I can't confirm whether it's offered as its own service \u2014 ask directly on Discord or by email.",
      link: DISCORD, defer: true },
    { k: ["rush", "priority", "urgent", "asap", "express", "faster"],
      a: "I don't want to promise a rush option that might not exist \u2014 ask on Discord or by email with your date and you'll get a straight answer.",
      link: DISCORD, defer: true },
    { k: ["watermark", "signature", "signed"],
      a: "I'm not sure on watermarking or signatures, and I'd rather not guess \u2014 quick question for Discord or email.",
      link: DISCORD, defer: true },
    { k: ["age limit", "how old", "minor", "under 18", "be 18", "old enough", "age requirement"],
      a: "I don't have a stated policy on that, so best to ask directly on Discord or by email.",
      link: DISCORD, defer: true },
    { k: ["currency", "usd", "tax", "vat", "eur", "gbp"],
      a: "I don't want to guess on currency or tax handling \u2014 that'll come back clearly with your quote, or you can ask on Discord.",
      link: DISCORD, defer: true },
    { k: ["nda", "private", "confidential", "don't post", "keep secret"],
      a: "I can't confirm how private commissions are handled \u2014 worth raising directly on Discord or by email before you order.",
      link: DISCORD, defer: true },
    { k: ["number of revisions", "how many revisions", "revisions included", "revision limit"],
      a: "I don't have an exact revision count to give you. Changes get flagged at the sketch stage, and Premium includes priority revisions \u2014 for the exact number, ask on Discord or by email.",
      link: DISCORD, defer: true }
  ];

  // Scored match: prefer the entry with the most (and longest) hits.
  function fallbackFor(text) {
    const lower = " " + text.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ") + " ";
    let best = null;
    let bestScore = 0;

    FAQ.forEach(function (entry) {
      let score = 0;
      entry.k.forEach(function (kw) {
        // must start at a word boundary ("age" shouldn't match "package"),
        // but may run on into a suffix so "emote" still catches "emotes"
        if (lower.indexOf(" " + kw) === -1) return;
        // multi-word phrases are much stronger evidence than a bare word
        score += kw.indexOf(" ") !== -1 ? kw.length * 2 : kw.length;
      });
      if (score > bestScore) { bestScore = score; best = entry; }
    });

    // Scoring keeps short words like "hi" from hijacking a real question:
    // a longer, more specific keyword in another entry always outranks them.
    if (best && bestScore >= 2) return best;

    return {
      a: "I'm not sure about that one, and I'd rather not guess. The Discord is the fastest way to get a real answer, or email " + CONFIG.email + ".",
      link: DISCORD
    };
  }

  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .ac-launcher {
      position: fixed; bottom: 22px; right: 22px; z-index: 999999;
      width: 60px; height: 60px; border-radius: 50%;
      background: linear-gradient(135deg, #C9A6FF, #FFB6D9);
      display: flex; align-items: center; justify-content: center;
      font-size: 26px; cursor: pointer; border: none;
      box-shadow: 0 6px 18px rgba(150, 90, 200, 0.35);
      transition: transform 0.18s ease;
      overflow: hidden; padding: 6px;
    }
    .ac-launcher img { width: 100%; height: 100%; object-fit: contain; }
    .ac-launcher:hover { transform: scale(1.08) rotate(-4deg); }
    .ac-launcher:focus-visible { outline: 3px solid #7C4DFF; outline-offset: 3px; }
    .ac-badge { position: absolute; top: -2px; right: -2px; width: 14px; height: 14px; background: #FF6EC7; border-radius: 50%; border: 2px solid #fff; }

    .ac-panel {
      position: fixed; bottom: 96px; right: 22px; z-index: 999999;
      width: 344px; max-width: calc(100vw - 32px);
      height: 486px; max-height: calc(100vh - 140px);
      background: #FFF6FA; border-radius: 20px;
      box-shadow: 0 16px 44px rgba(90, 40, 120, 0.28);
      display: flex; flex-direction: column; overflow: hidden;
      opacity: 0; transform: translateY(16px) scale(0.97); pointer-events: none;
      transition: opacity 0.16s ease, transform 0.16s ease;
      border: 1px solid rgba(201, 166, 255, 0.35);
    }
    .ac-panel.ac-open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }

    .ac-header { background: linear-gradient(120deg, #C9A6FF, #FF9EC4); padding: 14px 16px; display: flex; align-items: center; gap: 10px; color: #3D2C4A; }
    .ac-avatar {
      width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.55);
      display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;
      overflow: hidden; padding: 3px;
    }
    .ac-avatar img { width: 100%; height: 100%; object-fit: contain; }
    .ac-header-text { flex: 1; min-width: 0; }
    .ac-header-title { font-family: 'Quicksand', sans-serif; font-weight: 700; font-size: 14.5px; line-height: 1.2; }
    .ac-header-sub { font-size: 11.5px; opacity: 0.85; }
    .ac-close { background: rgba(255,255,255,0.5); border: none; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px; color: #3D2C4A; line-height: 1; }
    .ac-close:hover { background: rgba(255,255,255,0.8); }

    .ac-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .ac-msg { max-width: 84%; font-size: 13.5px; line-height: 1.45; padding: 9px 12px; border-radius: 14px; white-space: pre-wrap; word-wrap: break-word; }
    .ac-msg.bot { align-self: flex-start; background: #FFFFFF; color: #3D2C4A; border: 1px solid rgba(201,166,255,0.3); border-bottom-left-radius: 4px; }
    .ac-msg.user { align-self: flex-end; background: linear-gradient(120deg, #C9A6FF, #FFB6D9); color: #3D2C4A; border-bottom-right-radius: 4px; }
    .ac-msg strong { color: #A64DFF; }

    .ac-typing { align-self: flex-start; display: flex; gap: 4px; padding: 11px 13px; background: #FFF; border: 1px solid rgba(201,166,255,0.3); border-radius: 14px; border-bottom-left-radius: 4px; }
    .ac-dot { width: 6px; height: 6px; border-radius: 50%; background: #C9A6FF; animation: acbounce 1.1s infinite; }
    .ac-dot:nth-child(2) { animation-delay: 0.15s; }
    .ac-dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes acbounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.5; } 30% { transform: translateY(-4px); opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .ac-dot { animation: none; } .ac-panel { transition: none; } }

    .ac-link-chip { align-self: flex-start; font-size: 12px; text-decoration: none; color: #7C4DFF; background: #F4E9FF; border: 1px solid #E3CCFF; padding: 5px 10px; border-radius: 10px; font-weight: 700; }
    .ac-link-chip:hover { background: #EADAFF; }

    .ac-quick { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px; }
    .ac-chip { font-size: 11.5px; background: #FFFFFF; border: 1px solid #E3CCFF; color: #6B4C8A; padding: 6px 10px; border-radius: 999px; cursor: pointer; font-weight: 700; text-align: left; }
    .ac-chip:hover { background: #F4E9FF; }

    .ac-inputrow { display: flex; gap: 8px; padding: 10px; border-top: 1px solid rgba(201,166,255,0.3); background: #FFFFFF; }
    .ac-input { flex: 1; border: 1px solid #E3CCFF; border-radius: 12px; padding: 9px 11px; font-size: 13px; outline: none; color: #3D2C4A; background: #FFF6FA; }
    /* 16px on touch devices, or iOS Safari force-zooms the whole page
       when the chat input gets focus -- 13px was well under that. */
    @media (max-width: 640px) { .ac-input { font-size: 16px; } }
    .ac-input:focus { border-color: #C9A6FF; }
    .ac-send { background: linear-gradient(120deg, #C9A6FF, #FF9EC4); border: none; color: #3D2C4A; font-weight: 800; border-radius: 12px; padding: 0 14px; cursor: pointer; font-size: 13px; }
    .ac-send:disabled { opacity: 0.5; cursor: default; }

    @media (max-width: 420px) {
      .ac-panel { right: 12px; left: 12px; width: auto; bottom: 88px; }
      .ac-launcher { right: 16px; bottom: 16px; }
    }
  `;

  function init() {
    const host = document.createElement("div");
    host.id = "autheria-chatbot-host";
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });

    const mascotHtml = CONFIG.mascotImage
      ? '<img src="' + CONFIG.mascotImage + '" alt="' + CONFIG.brandName + ' mascot" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{textContent:\'' + CONFIG.mascot + '\'}))" />'
      : CONFIG.mascot;

    root.innerHTML =
      "<style>" + STYLES + "</style>" +
      '<button class="ac-launcher" aria-label="Open commission helper chat">' +
      mascotHtml + '<span class="ac-badge"></span></button>' +
      '<div class="ac-panel" role="dialog" aria-label="Commission helper">' +
      '<div class="ac-header">' +
      '<div class="ac-avatar">' + mascotHtml + "</div>" +
      '<div class="ac-header-text">' +
      '<div class="ac-header-title">' + CONFIG.brandName + "</div>" +
      '<div class="ac-header-sub">Commission Helper</div></div>' +
      '<button class="ac-close" aria-label="Close chat">\u2715</button></div>' +
      '<div class="ac-messages" aria-live="polite"></div>' +
      '<div class="ac-quick"></div>' +
      '<div class="ac-inputrow">' +
      '<input class="ac-input" type="text" placeholder="Ask me anything\u2026" />' +
      '<button class="ac-send">Send</button></div></div>';

    const launcher = root.querySelector(".ac-launcher");
    const panel = root.querySelector(".ac-panel");
    const closeBtn = root.querySelector(".ac-close");
    const messages = root.querySelector(".ac-messages");
    const quick = root.querySelector(".ac-quick");
    const input = root.querySelector(".ac-input");
    const sendBtn = root.querySelector(".ac-send");

    let opened = false;
    let busy = false;
    const history = [];

    function scrollDown() { messages.scrollTop = messages.scrollHeight; }

    function addMessage(text, who, link) {
      const div = document.createElement("div");
      div.className = "ac-msg " + who;
      const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      div.innerHTML = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      messages.appendChild(div);
      if (link) {
        const a = document.createElement("a");
        a.className = "ac-link-chip";
        a.href = link.href;
        a.textContent = link.label;
        if (/^https?:/.test(link.href)) { a.target = "_blank"; a.rel = "noopener"; }
        messages.appendChild(a);
      }
      scrollDown();
    }

    function showTyping() {
      const t = document.createElement("div");
      t.className = "ac-typing";
      t.innerHTML = '<span class="ac-dot"></span><span class="ac-dot"></span><span class="ac-dot"></span>';
      messages.appendChild(t);
      scrollDown();
      return t;
    }

    function renderQuick() {
      quick.innerHTML = "";
      CONFIG.quickReplies.forEach(function (q) {
        const b = document.createElement("button");
        b.className = "ac-chip";
        b.textContent = q;
        b.addEventListener("click", function () { send(q); });
        quick.appendChild(b);
      });
    }

    async function send(text) {
      text = (text || "").trim();
      if (!text || busy) return;

      busy = true;
      sendBtn.disabled = true;
      input.value = "";
      addMessage(text, "user");
      history.push({ role: "user", content: text });
      quick.innerHTML = "";

      const typing = showTyping();

      try {
        const res = await fetch(CONFIG.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.slice(-CONFIG.maxHistory) }),
        });
        const data = await res.json();
        typing.remove();

        if (!res.ok || !data.reply) throw new Error(data.error || "no reply");

        addMessage(data.reply, "bot");
        history.push({ role: "assistant", content: data.reply });
      } catch (err) {
        typing.remove();
        const fb = fallbackFor(text);
        addMessage(fb.a, "bot", fb.link);
        renderQuick();   // never dead-end the conversation
      } finally {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      }
    }

    function setOpen(next) {
      opened = next;
      panel.classList.toggle("ac-open", opened);
      launcher.setAttribute("aria-expanded", opened ? "true" : "false");
      if (!opened) { launcher.focus(); return; }
      const badge = root.querySelector(".ac-badge");
      if (badge) badge.remove();          // unread dot has served its purpose
      if (messages.children.length === 0) {
        addMessage(CONFIG.greeting, "bot");
        renderQuick();
      }
      input.focus();
    }
    launcher.setAttribute("aria-expanded", "false");
    launcher.addEventListener("click", function () { setOpen(!opened); });
    closeBtn.addEventListener("click", function () { setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && opened) setOpen(false);
    });
    sendBtn.addEventListener("click", function () { send(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") send(input.value);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();
