var config = {
    /* Demo profile data for the template. Replace as needed. */
    name: "Shirong Lu",
    sex: "Backend / Systems",
    age: "Shanghai, China",
    phone: '<a href="https://github.com/happysnaker" target="_blank">github.com/happysnaker</a>',
    email: "happysnaker@foxmail.com",
    address: '<a href="https://happysnaker.github.io/" target="_blank">happysnaker.github.io</a>',
    qq: '<strong>Template saved you time?</strong> <a href="https://happysnaker.github.io/support/#from-resume" target="_blank">Tip ¥9.9 / ¥19.9 via WeChat / Alipay</a><br><strong>Portfolio still feels generic / student-ish?</strong> <a href="https://happysnaker.github.io/review/" target="_blank">Book a ¥29.9 quick read / ¥99 async review</a>',
    log: "happysnaker",
    excpect_work: "Backend / Infrastructure / Systems Engineering",

    motto: [
        "Build useful things, then explain them clearly.",
        "Reliability is a feature.",
        "Keep systems simple, observable, and operable.",
        "Write less magic, ship more signal.",
        "Good documentation compounds engineering impact."
    ],

    welcome: "Backend / Systems Engineer<br>Go · Java · Distributed Systems<br>Go / Java backend builder<br>Glad to have you here.",

    about: "<p>你好，我是 Shirong Lu（happysnaker），专注 Go / Java 后端、分布式系统、RPC、可观测性与工程效率。</p>" +
        "<p>我持续公开构建可复用的工程资产，例如 Go 服务脚手架、后端工程师成长清单、系统学习笔记与技术博客。</p>" +
        "<p>近期我也在为 urfave/cli、go-chi/chi、GitHub Docs、Docker Docs、OpenTelemetry 等项目持续提交代码修复与工程相关贡献，把可复用经验沉淀成公开资产。</p>",

    skills: [
        ["Go", 90, "#00ADD8"],
        ["Java", 88, "#f89820"],
        ["Distributed Systems", 85, "#7c3aed"],
        ["SQL / Storage", 88, "#14b8a6"],
        ["Observability", 80, "#22c55e"],
        ["Networking / OS", 78, "#f59e0b"]
    ],

    skills_description: "<ul>" +
        "<li>Go / Java 后端服务设计与基础工程搭建。</li>" +
        "<li>关注 RPC、超时/重试、幂等、缓存、队列与服务治理。</li>" +
        "<li>重视日志、指标、追踪与线上可观测性。</li>" +
        "<li>具备数据库索引、事务、SQL 调优与存储基础。</li>" +
        "<li>喜欢把工程经验整理成模板、清单与可复用资产。</li>" +
        "</ul>",

    portfolio: [
        ["./images/card-oss-contrib.png", "https://github.com/happysnaker/qq-ai-bot", "qq-ai-bot", "Self-hosted QQ ↔ AI bot scaffold with OneBot 11 / NapCat / LLOneBot, ACP-compatible agents, persistent sessions, progress streaming, and a Docker demo."],
        ["./images/card-go-service-starter.png", "https://github.com/happysnaker/go-service-starter", "go-service-starter", "Production-minded Go HTTP service starter with health endpoints, structured logging, graceful shutdown, and Docker."],
        ["./images/card-backend-checklist.png", "https://github.com/happysnaker/backend-engineer-checklist", "backend-engineer-checklist", "Practical roadmap for Go, Java, distributed systems, databases, networking, and observability."],
        ["./images/card-oss-contrib.png", "https://github.com/github/docs/pulls?q=is%3Apr+author%3Ahappysnaker", "Open-source contributions", "Recent docs and engineering contributions across GitHub Docs, Docker Docs, OpenTelemetry, Prometheus, chi, and Vue docs."]
    ],

    work: [
        ["2026 — Present", "<br>Open-source builder",
            "<p><strong>Independent engineering work</strong></p>" +
            "<p>Package practical backend assets and learning material for public reuse, including starters, checklists, notes, and documentation improvements.</p>" +
            "<p>Emphasis: clean service structure, operational clarity, and reusable engineering patterns.</p>"
        ],
        ["2026 — Present", "<br>Documentation contributor",
            "<p><strong>OSS engineering contributions</strong></p>" +
            "<p>Actively contribute small but real fixes, behavior clarifications, and developer-experience improvements across urfave/cli, chi, GitHub Docs, Docker Docs, OpenTelemetry Go, Prometheus, and Vue docs.</p>" +
            "<p>Focus on accuracy, developer experience, and making complex systems easier to understand.</p>"
        ]
    ],

    others: [
        ["2026-06", "Packaged go-service-starter", "Published a production-minded Go HTTP service starter with docs, Docker support, health endpoints, and graceful shutdown."],
        ["2026-06", "Published backend-engineer-checklist", "Built a shareable backend growth checklist covering languages, databases, distributed systems, networking, and observability."],
        ["2026-06", "Ongoing OSS contributions", "Opened pull requests for GitHub Docs, Docker Docs, OpenTelemetry Go, Prometheus, chi, and Vue docs."],
        ["2026-06", "Technical writing", "Maintain a personal technical site with notes on backend engineering, Java/Go, and systems topics."]
    ],

    icon: [
        ["./svg/github.svg", "https://github.com/happysnaker", "GitHub profile"],
        ["./svg/博客.svg", "https://happysnaker.github.io/", "Technical blog"],
        ["./svg/github.svg", "https://happysnaker.github.io/support/#from-resume", "Support via WeChat / Alipay"]
    ],

    url: [
        "./images/index_background.jpg",
        "./images/avatar.jpg",
        "./images/work-bk.png",
        "./images/4.jpg"
    ]
}
