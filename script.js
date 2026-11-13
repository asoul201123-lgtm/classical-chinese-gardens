// --- 全局变量与 ECharts 实例 ---
let chartsInitialized = false;
let wordCloudInitialized = false;
let currentEraIndex = 0;
let mapInstance = null;
let heatLayer = null;
let mapMarkers = null;
let localMapInstance = null;
let mapProvider = 'loading';
let mapInitializing = false;
let lineChart = null;
let pieChart = null;
let currentGarden = '';
const userRatings = GardenApp.storage.get('gardenRatings', {}); 
let selectedFragments = [];
let particles = [];
let mapInteractiveMode = false; // 地图交互状态标志
let mapInteractiveTimer = null; // 地图交互自动退出定时器
let savedScrollPosition = 0;
// --- 辅助函数 ---
function getAreaByLngLat(lng, lat) {
    if (lat >= 39.5) return "北方";
    if (lat >= 34 && lng <= 115) return "中原";
    if (lng >= 118 && lat >= 30) return "江南";
    if (lng >= 113 && lat <= 25) return "岭南";
    if (lng <= 105 && lat >= 28) return "西南";
    if (lng >= 113 && lat <= 30) return "华中";
    return "中原";
}

function getGardenType(lng, lat) {
    if (lat >= 34.5) return "北方园林";
    if (lng >= 118 && lat >= 29) return "江南园林";
    if (lng >= 112 && lat <= 25.5) return "岭南园林";
    return "其他";
}

const eraImageFolderMap = {
    "殷周秦汉": "殷周名园",
    "魏晋南北朝": "魏晋南北朝名园名录",
    "隋唐": "隋唐名园名录",
    "宋辽金": "宋辽金名园录图片",
    "元": "元朝名园录",
    "明": "明朝名园录",
    "清": "image"
};

const eraFallbackImgMap = {
    "殷周秦汉": "image/殷周时期.png",
    "魏晋南北朝": "image/魏晋南北朝私家园林.png",
    "隋唐": "image/华清池2.png",
    "宋辽金": "宋辽金名园录图片/艮岳.jpeg",
    "元": "元朝名园录/狮子林.jpg",
    "明": "明朝名园录/拙政园.jpeg",
    "清": "image/颐和园.png"
};

const gardenImageNameAlias = {
    "沪渎园": "沪读园",
    "华清池": "华清宫"
};

function normalizeGardenName(name) {
    return String(name || '').replace(/\s+/g, '').trim();
}

function escapeJsSingleQuotedString(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildGardenImageCandidates(name, era) {
    const normalized = normalizeGardenName(name);
    const baseNames = [];
    const pushBase = (v) => {
        const nv = normalizeGardenName(v);
        if (nv && !baseNames.includes(nv)) baseNames.push(nv);
    };

    pushBase(normalized);
    if (gardenImageNameAlias[normalized]) pushBase(gardenImageNameAlias[normalized]);
    if (normalized.endsWith('前身')) pushBase(normalized.slice(0, -2));
    if (normalized.endsWith('园林')) pushBase(normalized.slice(0, -2));

    const primaryFolder = eraImageFolderMap[era];
    const folders = [];
    const pushFolder = (f) => { if (f && !folders.includes(f)) folders.push(f); };
    pushFolder(primaryFolder);
    if (primaryFolder !== "image") pushFolder("image");

    const exts = ['.png', '.jpg', '.jpeg', '.webp'];
    const candidates = [];
    folders.forEach(folder => {
        baseNames.forEach(base => {
            exts.forEach(ext => {
                candidates.push(`${folder}/${base}${ext}`);
            });
        });
    });
    return window.GardenAssetPaths ? candidates.filter(src => GardenAssetPaths.has(src)) : candidates;
}

function setImageWithFallback(imgEl, candidates, fallbackSrc) {
    if (!imgEl) return;
    const uniqueCandidates = Array.from(new Set((candidates || []).filter(src => src && (!window.GardenAssetPaths || GardenAssetPaths.has(src)))));
    let idx = 0;

    const tryNext = () => {
        if (idx >= uniqueCandidates.length) {
            imgEl.onerror = null;
            imgEl.src = fallbackSrc;
            return;
        }
        imgEl.src = uniqueCandidates[idx++];
    };

    imgEl.onerror = tryNext;
    tryNext();
}

function hydrateGardenThumbs(containerEl, era) {
    if (!containerEl) return;
    const fallback = eraFallbackImgMap[era] || "image/盆景.jpg";
    containerEl.querySelectorAll('img.garden-thumb').forEach(img => {
        const name = img.getAttribute('data-name') || '';
        setImageWithFallback(img, buildGardenImageCandidates(name, era), fallback);
    });
}

const eraNarratives = {
    "殷周秦汉": "早期园林多由“苑囿、离宫、台榭、池沼”发展而来，强调规模、礼制与观游功能，常以大水面与高台形成视觉中心。",
    "魏晋南北朝": "社会动荡与玄学之风使园林更重“寄情山水”，私家园与寺观园林兴起，追求自然野逸与清旷意境。",
    "隋唐": "都城宫苑气象宏阔，山水、建筑与仪礼并重；同时诗酒风雅与文人审美进入造园体系，形成诗画互证的空间气质。",
    "宋辽金": "写意审美成熟，理水叠山与“移步换景”更精微；江南私园兴盛，文人题咏与园居生活紧密相连。",
    "元": "文人园居更显疏淡简远，偏好留白与借景，禅意与诗意交织，空间更强调“清、淡、静”。",
    "明": "造园理论与实践臻于成熟，私家园林构图严谨而富变化，亭台轩榭与花木山石形成精密的画面组织。",
    "清": "皇家园林规模宏大、山水格局更完整；私园技艺亦更精纯，地方园林风格分化明显，讲究礼序与自然并举。"
};

const gardenAutoFacts = {
    "上林苑": {
        history: "上林苑是秦汉时期著名的皇家苑囿系统之一，兼具狩猎、游观与礼制象征等功能，体现了早期“苑囿传统”的宏大格局。",
        relics: "相关遗迹多以地名、水系与考古遗址等方式留存，具体范围随历代变迁而调整。",
        anecdote: "史籍常以“上林”指代皇家苑囿的典型形态，亦成为后世文学中“盛大苑囿”的意象来源。"
    },
    "阿房宫": {
        history: "阿房宫常被视为秦代宫殿营建理想与国家动员能力的象征，其形象在历史叙述与文学想象中长期叠加。",
        relics: "关于其规模与形制，历史文献与考古研究长期并行讨论，遗址相关展示以“秦汉都城遗址体系”中的重要节点呈现。",
        anecdote: "“阿房宫”在后世文论里常作为“盛极而衰”的象征性地标，被大量诗文引用。"
    },
    "未央宫": {
        history: "未央宫为西汉长安城的重要宫殿区，作为政治与礼仪中心之一，代表了汉代宫苑体系的空间秩序与礼制结构。",
        relics: "遗址以夯土台基、宫城格局与出土遗存为主要线索，可从遗址公园与博物馆展示体系中获得更完整的空间想象。",
        anecdote: "“未央”寓意绵延无尽，常被后世作为“帝都宫阙”的文学意象。"
    },
    "昆明池": {
        history: "汉代开凿的大型水面工程，兼具水利、操练与游观等多重功能，是早期“以水为骨”的宫苑理水范式之一。",
        relics: "遗迹线索多与水系遗存、堤岸与周边遗址分布相关，反映古代大型水工与宫苑的耦合关系。",
        anecdote: "后世常以“昆明池”指代宏阔水面与水上活动的宫苑图景。"
    },
    "兰亭": {
        history: "兰亭与东晋王羲之等人的雅集叙事紧密相关，成为文人园居与山水清谈的精神象征之一。",
        relics: "相关遗址与纪念性空间多以碑刻、题咏、复建景点与文化展示的形式延续其影响。",
        anecdote: "“曲水流觞”与《兰亭集序》的故事塑造了“以景成文、以文传景”的经典范式。"
    },
    "金谷园": {
        history: "金谷园常见于魏晋南北朝时期的名园叙事中，映射士族生活与园居文化的繁华面向，也折射动荡时代的盛衰无常。",
        relics: "其具体形制多赖文献线索与后世传承意象，空间细节往往难以完全复原。",
        anecdote: "与金谷宴集等文学叙事相关，后世常借其比喻豪奢与风流。"
    },
    "西苑": {
        history: "“西苑”常指都城西侧的大型宫苑水系与园林区域，在隋唐语境中与都城格局、礼仪游观与山水营造紧密相连。",
        relics: "遗存多以都城遗址、水系格局与考古发现为线索，展示侧重“宫苑—水系—城市”的整体关系。",
        anecdote: "在后世叙事中，“西苑”经常作为“帝都盛景”的代称出现。"
    },
    "大明宫太液池": {
        history: "大明宫是唐代长安的重要宫殿群之一，太液池作为宫苑水景核心，体现了盛唐宫苑对大水面、对景与礼仪空间的综合运用。",
        relics: "遗址展示多可从宫殿区格局、池沼位置与轴线关系理解“礼制秩序 + 山水游观”的复合结构。",
        anecdote: "“太液”之名在历代宫苑中反复出现，常指核心水景与仙境想象的结合。"
    },
    "兴庆宫": {
        history: "兴庆宫在唐代都城生活中地位重要，园林部分与宫殿生活、节庆游乐与诗文题咏关联密切。",
        relics: "遗址与公园化展示有助于理解唐代宫苑在城市空间中的位置与尺度感。",
        anecdote: "唐诗语境中常可见对宫苑景色的描绘，反映“宫苑亦为文化舞台”的特征。"
    },
    "华清宫": {
        history: "华清宫位于骊山北麓，以温泉行宫闻名，历代营建叠加，唐代尤盛，既是皇家休憩之所，也是历史叙事高度密集的地点。",
        relics: "遗址常以温泉浴池遗构、宫殿基址与相关纪念空间呈现，便于从“温泉—山势—宫苑”三者关系理解其场所性。",
        anecdote: "与《长恨歌》等文学叙事相关联，使其成为盛唐浪漫与兴衰象征的复合意象。"
    },
    "九成宫": {
        history: "九成宫作为避暑行宫类型的重要代表，体现了都城之外“山水—宫殿—气候”共同塑造的皇家园居方式。",
        relics: "相关遗址与碑刻传统常被视为理解行宫制度与书法文化传播的重要线索。",
        anecdote: "历代题刻与文人记述强化了其“清凉避暑、山水胜境”的文化记忆。"
    },
    "辋川别业": {
        history: "辋川别业常与唐代文人山水实践相关，被视为“诗画入园”的典型语境之一，强调借景、意境与日常园居。",
        relics: "其空间多依赖诗文与绘画线索重构，成为后世理解文人园居的想象原型。",
        anecdote: "诗文中的“景名体系”常被用作后世园林命名与题咏的来源。"
    },
    "曲江池": {
        history: "曲江池作为唐代长安的重要游赏水景区域，承载节庆游乐与城市公共生活，是都城景观系统的重要节点。",
        relics: "水系遗存与城市格局的关系是理解其空间意义的关键：它不仅是园林，也是城市景观基础设施。",
        anecdote: "“曲江流饮”与踏青游宴等传统叙事，使其成为唐代都市风雅的代表意象。"
    },
    "艮岳": {
        history: "艮岳是北宋皇家园林营造的代表之一，以大规模叠山理水与奇石花木组织著称，体现宫苑审美与技术动员的顶峰状态。",
        relics: "相关遗存多见于史籍与后世传述，对其空间想象常以“万岁山”等关键词串联。",
        anecdote: "后世常以艮岳讨论“极致审美与国力消耗”的张力，成为园林史中的重要议题。"
    },
    "沧浪亭": {
        history: "沧浪亭是江南园林早期成熟形态的重要代表之一，以清雅质朴的文人气质和与水系的关系著称。",
        relics: "园林的廊、窗、台与水岸关系可作为理解“借景与界面”的关键线索。",
        anecdote: "园名与诗文传统关联紧密，常被用来表达“濯缨清志”的精神旨趣。"
    },
    "沈园": {
        history: "沈园在宋代园林文化记忆中具有特殊位置，园林空间与文学叙事彼此强化，使其成为“园以文传”的典型案例。",
        relics: "纪念性空间与题刻传统使园林叙事得以延续，形成“可游可读”的复合场所。",
        anecdote: "陆游《钗头凤》相关故事让沈园成为中国园林中最具情感色彩的典故之一。"
    },
    "狮子林": {
        history: "狮子林以假山叠石与曲折游线著称，体现江南园林在有限尺度内营造“迷宫式山水”的能力。",
        relics: "太湖石假山群与洞壑游径是其最具辨识度的遗存线索。",
        anecdote: "与禅意空间与文人雅集的叙事常相互交织，形成“山水—禅—文”一体的文化想象。"
    },
    "拙政园": {
        impact: "明代文人园林的巅峰代表，由王献臣营建、文徵明参与规划，以水为核心、疏朗自然的布局奠定了江南文人园林的基本范式。它将诗画意境与造园手法高度融合，体现“虽由人作，宛自天开”的审美追求，对明清江南私家园林的空间结构、意境营造产生深远影响，成为后世造园效仿的典范，也让文人园林从隐逸空间转向文化精神的象征。",
        significance: "作为世界文化遗产，拙政园为现代景观设计提供了“诗意造景”的经典思路，其空间层次、借景手法、植物配置在当代城市公园、居住区景观中被广泛借鉴。它所承载的文人生活美学与生态营造理念，对现代人居环境建设、文化遗产活化、传统园林现代化转译都具有重要启示，也成为传播中国园林文化的重要载体。"
    },
    "留园": {
        impact: "以极致的空间艺术著称，通过曲折回廊、精巧框景、虚实相生的布局，在有限场地内创造出层次丰富、移步换景的空间体验，是江南园林空间营造的教科书。其建筑与山水的紧密结合、对视线与路径的精妙控制，影响了后世园林空间设计的叙事方式，也成为研究中国古典园林空间美学的核心案例，代表了清代私家园林营造技艺的最高水平。",
        significance: "留园的“小中见大”空间策略，为现代高密度城市中的小游园、口袋公园、庭院设计提供重要参考。其空间组织方式、节点营造手法被大量运用于现代景观与建筑设计中，同时在古建修复、遗产保护方面形成成熟经验，为历史园林的可持续保护与展示提供了可复制的实践模式。"
    },
    "沧浪亭": {
        impact: "苏州现存最古老的园林，为宋代文人园林的开山之作。它突破传统封闭园墙格局，开创性地将园外水系借入园内，形成内外交融的开放式布局，奠定了江南园林“借景”艺术的重要基础。园林风格简洁古雅、不事雕琢，体现宋代文人淡泊隐逸的审美取向，对元明清文人园林的精神内核与造园理念影响深远。",
        significance: "沧浪亭的开放共享理念，对现代城市公园与公共空间设计具有重要启示，尤其在景观边界处理、城市水系利用、生态共享方面极具参考价值。其简约古雅的风格也为当代新中式景观提供了审美范本，推动传统园林精神在现代城市更新中延续，成为历史文脉保护与城市公共生活结合的典范。"
    },
    "狮子林": {
        impact: "元代禅意园林代表，以大规模假山群闻名，将禅宗意境、山水画理与叠山技艺融为一体，形成“曲径通幽、洞壑婉转”的独特空间。其假山布局繁复精妙，石形模拟佛宗意象，是中国古代写意假山营造的高峰，深刻影响明清江南叠山风格，也让禅意园林成为文人园林中重要分支。",
        significance: "狮子林的沉浸式假山体验为现代互动景观、儿童游乐空间、体验式园林设计提供灵感。其复杂路径与空间探索模式被运用于主题园区、文旅项目设计中，同时在传统叠山技艺传承、石文化研究、禅意景观营造方面具有重要价值，推动传统造园技艺在当代景观中的创新应用。"
    },
    "网师园": {
        impact: "小型文人园林的极致典范，以“小园极则”著称。全园布局紧凑精巧，建筑、山水、花木比例和谐，于方寸之间营造出深远意境，代表了江南私家园林“精而合宜、巧而得体”的最高水准。其空间尺度、庭院营造、生活场景融合的方式，成为后世小园林设计的标杆，影响深远。",
        significance: "网师园为现代庭院、屋顶花园、小型私家庭院、精品酒店景观提供直接设计参考。其精细化造景、意境营造、低干预生态布局在当代居住景观设计中广泛应用，同时作为海外复刻（如纽约明轩）的原型，成为中国古典园林走向世界的文化符号，推动传统园林国际化传播。"
    },
    "个园": {
        impact: "清代扬州园林的巅峰之作，以“四季假山”独创一格，用不同石材与植物分别象征春夏秋冬，将时序意境与叠山艺术结合，形成极具特色的主题式园林。其造园手法大胆新颖，代表了扬州盐商园林富丽而不失文气的风格，丰富了中国古典园林的主题表达与空间叙事方式。",
        significance: "个园的主题造景思路为现代主题公园、季节景观、特色街区提供重要借鉴，其对材料、色彩、季相变化的运用启发当代景观设计的表现力。作为扬州园林代表，它也成为地域园林文化研究的重要实例，推动传统园林在文旅开发、文化展示中的活化利用。"
    },
    "寄畅园": {
        impact: "江南山地园林的经典，以借景惠山、八音涧流水声景著称，巧妙利用山地地形营造自然天成的山水格局。其“虽由人作，宛自天开”的营造理念影响深远，清代颐和园谐趣园即以其为蓝本，成为皇家园林借鉴江南私家园林的重要例证，在中国园林史上地位突出。",
        significance: "寄畅园的山地造园、声景设计、自然借景手法，为现代郊野公园、山地景观、生态修复项目提供重要参考。其低干预、顺应自然的设计思想契合当代生态景观理念，同时在古园修复、文化遗产可持续利用方面积累成熟经验，具有重要实践价值。"
    },
    "颐和园": {
        impact: "清代皇家园林集大成者，以杭州西湖为蓝本，融合南北造园特色，构建“一池三山”的经典皇家格局。它集宫廷理政、居住游赏、山水景观于一体，代表了中国皇家园林的最高成就，其规划布局、建筑形制、山水构图对近现代大型园林规划产生深远影响。",
        significance: "作为世界文化遗产与城市大型公共公园，颐和园为现代城市生态格局、大型滨水公园、文化景区规划提供范本。其山水生态系统、防洪调蓄功能、文化景观结合模式对现代城市生态建设具有重要价值，也成为传统皇家文化展示与国民文化教育的重要空间。"
    },
    "避暑山庄": {
        impact: "清代规模最大的皇家园林，融合南北园林特色与蒙藏建筑风格，集政治、军事、宗教、游赏功能于一体，体现多民族文化交融的造园思想。其宏大山水格局与因地制宜的规划理念，代表了中国古代皇家园林与自然地貌结合的最高水平，影响深远。",
        significance: "避暑山庄为现代国家公园、生态度假区、山地文化园区提供规划范式，其文化多样性与自然生态保护模式对当代遗产保护具有重要启示。作为多民族文化共生的象征，它也在文化传承、文旅融合、生态教育方面发挥重要作用。"
    },
    "豫园": {
        impact: "明代上海私家园林代表，建筑精巧、叠山经典，是江南城市山林的典范。它见证了上海明清时期的城市文化与商贾园林特色，其空间布局、建筑装饰、假山营造对江南东部地区园林影响显著，也是上海历史文脉最重要的物质载体之一。",
        significance: "豫园与老城厢商业街区共生的模式，为历史园林与城市商业、文旅融合提供成功范例。其保护更新经验对历史城区活化、文化街区打造具有重要参考，同时成为上海城市文化标识，推动传统园林在现代都市中的公共化、生活化利用。"
    },
    "圆明园": {
        impact: "被誉为“万园之园”，集中国古典园林之大成并融合西洋楼景区，开创中西合璧的园林新格局，代表了18世纪世界园林艺术的高峰。其集锦式布局、水景营造、建筑组群规划深刻影响后世皇家与私家园林，是中国园林史上里程碑式的存在。",
        significance: "圆明园遗址作为重要文化遗产与爱国主义教育基地，为遗址保护、文化传承、历史叙事提供重要范式。其中西园林交融的理念对当代跨文化景观设计具有启示，遗址公园模式也成为现代文化遗产保护、生态修复与公众教育结合的经典案例。"
    }
};

function stripHtmlText(html) {
    return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function findGardenMetaByName(name) {
    const normalized = normalizeGardenName(name);
    const alias = gardenImageNameAlias[normalized] ? normalizeGardenName(gardenImageNameAlias[normalized]) : '';
    return gardenData.find(g => {
        const gName = normalizeGardenName(g[1]);
        return gName === normalized || (alias && gName === alias);
    }) || null;
}

function buildAutoGardenDetailHtml(name, era, baseHtml = '') {
    const meta = findGardenMetaByName(name);
    const lng = meta ? meta[2] : null;
    const lat = meta ? meta[3] : null;
    const region = (lng !== null && lat !== null) ? getAreaByLngLat(lng, lat) : '';
    const type = (lng !== null && lat !== null) ? getGardenType(lng, lat) : '';
    const intro = (eraBackgrounds[era] && eraBackgrounds[era].intro) ? eraBackgrounds[era].intro : '';
    const narrative = eraNarratives[era] || '';
    const facts = gardenAutoFacts[normalizeGardenName(name)] || null;
    const baseText = stripHtmlText(baseHtml);

    const overviewParts = [];
    if (era) overviewParts.push(`时代：${era}`);
    if (region) overviewParts.push(`区域：${region}`);
    if (type && type !== "其他") overviewParts.push(`类型：${type}`);
    if (lng !== null && lat !== null) overviewParts.push(`经纬度：${lng.toFixed(4)}，${lat.toFixed(4)}`);

    const overview = `${overviewParts.join(' · ')}。${narrative}`;
    const history = facts?.history || `关于“${name}”的形制与沿革，常见线索来自史籍记述、地方志与后世题咏。若为宫苑类型，多与都城格局、礼仪游观与水系营造相关；若为私园类型，则常与主人身份、园居生活与诗画审美相互映照。`;
    const relics = facts?.relics || `古迹线索通常体现在遗址格局、水系遗存、台基、碑刻题名与相关地名传统之中。即便实物保存有限，仍可通过“轴线—水面—建筑界面—借景关系”去重建其空间想象。`;
    const anecdote = facts?.anecdote || `园林典故多与“园名来历、主人逸事、诗文题咏、雅集活动”相关。阅读时可把园景当作一幅可行走的画卷：先辨水与山石，再看廊与窗的取景，再读题名与诗文的情绪指向。`;

    const blocks = [];
    if (baseText) {
        blocks.push(`
            <div class="detail-block">
                <h4><i class="fa-solid fa-feather-pointed"></i> 现有简介</h4>
                ${baseHtml}
            </div>
        `);
    }

    blocks.push(`
        <div class="detail-block">
            <h4><i class="fa-solid fa-map-location-dot"></i> 概览</h4>
            <p>${overview}</p>
            ${intro ? `<p>${intro}</p>` : ''}
        </div>
    `);

    blocks.push(`
        <div class="detail-block">
            <h4><i class="fa-solid fa-clock-rotate-left"></i> 历史</h4>
            <p>${history}</p>
        </div>
    `);

    blocks.push(`
        <div class="detail-block">
            <h4><i class="fa-solid fa-landmark"></i> 古迹</h4>
            <p>${relics}</p>
        </div>
    `);

    blocks.push(`
        <div class="detail-block">
            <h4><i class="fa-solid fa-book-open"></i> 典故</h4>
            <p>${anecdote}</p>
        </div>
    `);

    return blocks.join('');
}

const flyFlowerCorpus = {
    "花": [
        "人间四月芳菲尽，山寺桃花始盛开。",
        "迟日江山丽，春风花草香。",
        "小楼一夜听春雨，深巷明朝卖杏花。",
        "墙角数枝梅，凌寒独自开。遥知不是雪，为有暗香来。",
        "等闲识得东风面，万紫千红总是春。"
    ],
    "月": [
        "海上生明月，天涯共此时。",
        "举头望明月，低头思故乡。",
        "明月松间照，清泉石上流。",
        "但愿人长久，千里共婵娟。",
        "月出惊山鸟，时鸣春涧中。"
    ],
    "春": [
        "春眠不觉晓，处处闻啼鸟。",
        "春风又绿江南岸，明月何时照我还。",
        "国破山河在，城春草木深。",
        "野火烧不尽，春风吹又生。",
        "等闲识得东风面，万紫千红总是春。"
    ],
    "秋": [
        "自古逢秋悲寂寥，我言秋日胜春朝。",
        "停车坐爱枫林晚，霜叶红于二月花。",
        "长风万里送秋雁，对此可以酣高楼。",
        "银烛秋光冷画屏，轻罗小扇扑流萤。",
        "落霞与孤鹜齐飞，秋水共长天一色。"
    ],
    "山": [
        "会当凌绝顶，一览众山小。",
        "空山新雨后，天气晚来秋。",
        "横看成岭侧成峰，远近高低各不同。",
        "不识庐山真面目，只缘身在此山中。",
        "明月松间照，清泉石上流。"
    ],
    "水": [
        "黄河之水天上来，奔流到海不复回。",
        "逝者如斯夫，不舍昼夜。",
        "抽刀断水水更流，举杯消愁愁更愁。",
        "一道残阳铺水中，半江瑟瑟半江红。",
        "日出江花红胜火，春来江水绿如蓝。"
    ],
    "酒": [
        "对酒当歌，人生几何。",
        "劝君更尽一杯酒，西出阳关无故人。",
        "葡萄美酒夜光杯，欲饮琵琶马上催。",
        "人生得意须尽欢，莫使金樽空对月。",
        "借问酒家何处有，牧童遥指杏花村。"
    ]
};

function highlightChar(line, ch) {
    const esc = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return line.replace(new RegExp(esc, 'g'), `<b>${ch}</b>`);
}

function renderFlyFlowerList(ch) {
    const list = document.getElementById('fly-result-list');
    if (!list) return;
    list.innerHTML = '';
    const pool = flyFlowerCorpus[ch] || [];
    const items = pool.slice(0, 8);
    if (items.length === 0) {
        list.innerHTML = `<li>暂无“${ch}”相关诗句，试试上面的令字按钮。</li>`;
        return;
    }
    list.innerHTML = items.map(t => `<li>${highlightChar(t, ch)}</li>`).join('');
}

function initFlyFlowerGame() {
    const chips = document.querySelectorAll('.fly-chip');
    chips.forEach(btn => {
        btn.addEventListener('click', () => {
            const ch = btn.getAttribute('data-char');
            const input = document.getElementById('fly-char-input');
            if (input) input.value = ch;
            renderFlyFlowerList(ch);
        });
    });
    const startBtn = document.getElementById('fly-start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            const input = document.getElementById('fly-char-input');
            const ch = (input && input.value) ? input.value.trim() : '';
            if (!ch) return;
            renderFlyFlowerList(ch);
        });
    }
    const addBtn = document.getElementById('fly-add-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const inputCh = document.getElementById('fly-char-input');
            const ch = (inputCh && inputCh.value) ? inputCh.value.trim() : '';
            const lineInput = document.getElementById('fly-user-line');
            const line = (lineInput && lineInput.value) ? lineInput.value.trim() : '';
            if (!ch || !line || line.indexOf(ch) === -1) return;
            const list = document.getElementById('fly-result-list');
            if (list) {
                const li = document.createElement('li');
                li.innerHTML = highlightChar(line, ch);
                list.appendChild(li);
                lineInput.value = '';
            }
        });
    }
}

function initPhotoInsight() {
    const drop = document.getElementById('photo-drop');
    const input = document.getElementById('photo-input');
    const choose = document.getElementById('photo-choose');
    const analyze = document.getElementById('photo-analyze');
    const preview = document.getElementById('photo-preview');
    let currentFile = null;
    const setPreview = file => {
        const url = URL.createObjectURL(file);
        preview.src = url;
        preview.style.display = 'block';
        const hint = drop.querySelector('.photo-drop-hint');
        if (hint) hint.style.display = 'none';
        analyze.disabled = false;
        currentFile = file;
    };
    if (choose) choose.onclick = () => input && input.click();
    if (input) input.onchange = e => {
        const f = e.target.files && e.target.files[0];
        if (f) setPreview(f);
    };
    if (drop) {
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
        drop.addEventListener('drop', e => {
            e.preventDefault(); drop.classList.remove('dragover');
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if (f && f.type.startsWith('image/')) setPreview(f);
        });
    }
    if (analyze) analyze.onclick = async () => {
        if (!currentFile) return;
        const img = new Image();
        img.src = URL.createObjectURL(currentFile);
        await img.decode();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const w = 240, h = Math.max(1, Math.round(img.height * (240 / img.width)));
        canvas.width = w; canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const step = 4 * 4;
        let green = 0, blue = 0, gray = 0, red = 0, white = 0, black = 0, total = 0, edgeCnt = 0;
        for (let y = 1; y < h - 1; y += 2) {
            for (let x = 1; x < w - 1; x += 2) {
                const i = (y * w + x) * 4;
                const r = data[i], g = data[i + 1], b = data[i + 2];
                const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
                if (g > r * 1.2 && g > b * 1.1 && g > 60) green++;
                else if (b > r * 1.2 && b > g * 1.2 && b > 60) blue++;
                else if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && maxc > 40 && maxc < 185) gray++;
                else if (r > g * 1.2 && r > b * 1.1 && r > 80) red++;
                if (maxc > 220) white++;
                if (maxc < 35) black++;
                total++;
                const iL = (y * w + (x - 1)) * 4;
                const iR = (y * w + (x + 1)) * 4;
                const iT = ((y - 1) * w + x) * 4;
                const iB = ((y + 1) * w + x) * 4;
                const gx = Math.abs(data[iR] - data[iL]) + Math.abs(data[iR + 1] - data[iL + 1]) + Math.abs(data[iR + 2] - data[iL + 2]);
                const gy = Math.abs(data[iB] - data[iT]) + Math.abs(data[iB + 1] - data[iT + 1]) + Math.abs(data[iB + 2] - data[iT + 2]);
                if (gx + gy > 180) edgeCnt++;
            }
        }
        const p = v => total ? v / total : 0;
        const metrics = {
            green: p(green), blue: p(blue), gray: p(gray), red: p(red),
            white: p(white), black: p(black), edge: p(edgeCnt)
        };
        const insights = derivePhotoInsights(metrics);
        renderPhotoInsights(insights);
    };
}

function derivePhotoInsights(m) {
    const tags = [];
    const desc = [];
    if (m.blue > 0.18) {
        tags.push('理水');
        desc.push('画面中蓝色占比偏高，推测存在水体或大面积天空反射，属于理水要点。');
    }
    if (m.green > 0.28) {
        tags.push('花木配植');
        desc.push('绿色显著，植物覆盖度较高，可能强调花木配植与季相变化。');
    }
    if (m.gray > 0.15) {
        tags.push('叠石山石');
        desc.push('灰度聚集明显，呈现山石或假山质感，可能采用叠石造景。');
    }
    if (m.red > 0.12) {
        tags.push('建筑色彩');
        desc.push('暖色分量偏高，推测存在建筑檐、彩画或红墙元素，形成色彩对景。');
    }
    if (m.edge > 0.12) {
        tags.push('廊桥界面');
        desc.push('边缘密度较高，空间界面与线性构件可能明显，如曲廊、栏杆或桥体。');
    }
    if (m.white > 0.18 && m.black > 0.08) {
        tags.push('粉墙黛瓦');
        desc.push('亮暗对比与浅色占比提示粉墙、灰瓦等传统材料语汇。');
    }
    if (tags.length === 0) {
        tags.push('空间意象');
        desc.push('色彩与纹理分布均衡，可从“借景—对景—框景”入手进一步观察场景。');
    }
    return { tags, desc };
}

function renderPhotoInsights(result) {
    const box = document.getElementById('photo-insights');
    if (!box) return;
    const tagsHtml = result.tags.map(t => `<span class="insight-tag">${t}</span>`).join('');
    const descHtml = result.desc.map(d => `<p>${d}</p>`).join('');
    box.innerHTML = `<div class="insight-tags">${tagsHtml}</div><div class="insight-text">${descHtml}</div>`;
}

// --- 图表初始化与更新 ---
function initLineChart() {
    lineChart = echarts.init(document.getElementById('lineChart'));
    const seriesData = {北方园林: [], 江南园林: [], 岭南园林: []};
    dynasties.forEach(dy => {
        const items = gardenData.filter(d => d[0] === dy);
        let north = 0, south = 0, ling = 0;
        items.forEach(it => {
            const t = getGardenType(it[2], it[3]);
            if (t === "北方园林") north++;
            else if (t === "江南园林") south++;
            else if (t === "岭南园林") ling++;
        });
        seriesData["北方园林"].push(north);
        seriesData["江南园林"].push(south);
        seriesData["岭南园林"].push(ling);
    });
    lineChart.setOption({
        color: ['#d4a373', '#7a9d7a', '#b87a3a'],
        tooltip: { trigger: 'axis' },
        grid: { left: 34, right: 10, top: 24, bottom: 16, containLabel: true },
        xAxis: { type: 'category', data: dynasties, axisLabel: { fontSize: 9, rotate: 22 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
        series: [
            { name: '北方园林', type: 'line', data: seriesData["北方园林"], smooth: true, lineStyle: { width: 2.2 } },
            { name: '江南园林', type: 'line', data: seriesData["江南园林"], smooth: true, lineStyle: { width: 2.2 } },
            { name: '岭南园林', type: 'line', data: seriesData["岭南园林"], smooth: true, lineStyle: { width: 2.2 } }
        ]
    });
}

function updatePieChart(era) {
    const items = gardenData.filter(g => g[0] === era);
    const count = {中原:0,北方:0,江南:0,岭南:0,西南:0,华中:0};
    
    items.forEach(it => {
        const area = getAreaByLngLat(it[2], it[3]);
        count[area]++;
    });
    const pieData = areaNames.map(name => ({ name, value: count[name] })).filter(i => i.value > 0);
    const colors = pieData.map(item => areaColorMap[item.name]);
    if (!pieChart) return;
    pieChart.setOption({
        tooltip: {
            trigger: 'item',
            formatter: '{b}：{c} 座<br>占比：{d}%'
        },
        color: colors,
        series: [{
            type: 'pie',
            radius: ['0%', '66%'],
            data: pieData,
            label: {
                fontSize: 9,
                formatter: '{b} {d}%'
            }
        }]
    });
}

// --- 地图逻辑 ---
async function initMap() {
    const container = document.getElementById('chinaMap');
    if (!container || mapInitializing || mapInstance) return;
    mapInitializing = true;
    setMapStatus('loading', '正在连接腾讯地图…');
    try {
        if (location.protocol === 'file:') throw new Error('腾讯地图需要通过 VS Code 静态服务器打开');
        await GardenTencentMap.load();
        if (localMapInstance) { localMapInstance.dispose(); localMapInstance = null; }
        container.replaceChildren();
        mapInstance = new TMap.Map(container, {
            center: new TMap.LatLng(35.1, 108.3), zoom:4.2, minZoom:3, maxZoom:18,
            pitch:0, rotation:0, mapStyleId:'style1'
        });
        heatLayer = new TMap.visualization.Heat({radius:33, height:0, min:0, opacity:0.8}).addTo(mapInstance);
        const dot = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="5" fill="#954526" stroke="#fff8df" stroke-width="2"/></svg>');
        mapMarkers = new TMap.MultiMarker({id:'garden-points', map:mapInstance,
            styles:{garden:new TMap.MarkerStyle({width:16,height:16,anchor:{x:8,y:8},src:dot})}, geometries:[]});
        mapMarkers.on('click', event => {
            const name = event.geometry?.properties?.gardenName;
            if (name) showRichDetail(name);
        });
        mapProvider = 'tencent';
        container.dataset.provider = 'tencent';
        setMapStatus('tencent', '腾讯地图 · 园林热力分布');
    } catch (error) {
        if (mapMarkers) { mapMarkers.setMap(null); mapMarkers = null; }
        if (heatLayer) { heatLayer.destroy(); heatLayer = null; }
        if (mapInstance) { mapInstance.destroy(); mapInstance = null; }
        if (localMapInstance) { localMapInstance.dispose(); localMapInstance = null; }
        container.replaceChildren();
        localMapInstance = echarts.getInstanceByDom(container) || echarts.init(container);
        localMapInstance.off('click');
        localMapInstance.on('click', params => {
            if (params.seriesType === 'scatter' && params.name) showRichDetail(params.name);
        });
        mapProvider = 'local';
        container.dataset.provider = 'local';
        setMapStatus('local', '腾讯地图暂不可用，当前为本地示意图。' + error.message);
    } finally {
        mapInitializing = false;
        hideMapLoading();
        refreshByEra();
    }
}

function setMapStatus(state, message) {
    const status = document.getElementById('map-status');
    if (!status) return;
    status.dataset.state = state;
    status.replaceChildren(document.createTextNode(message));
    if (state === 'local') {
        const retry = document.createElement('button');
        retry.type = 'button'; retry.textContent = '重试腾讯地图'; retry.onclick = () => initMap();
        status.appendChild(retry);
    }
}

function updateGardenMap(gardens) {
    if (mapProvider === 'tencent' && heatLayer && mapMarkers) {
        const valid = gardens.filter(g => Number.isFinite(g[2]) && Number.isFinite(g[3]));
        const data = valid.map(g => ({lat:g[3], lng:g[2], count:Math.max(1, Math.round((Number(g[4]) || 2.5) * 10))}));
        heatLayer.setMax(Math.max(30, ...data.map(point => point.count)));
        heatLayer.setData(data);
        mapMarkers.setGeometries(valid.map((g,index) => ({id:`${currentEraIndex}-${index}`, styleId:'garden',
            position:new TMap.LatLng(g[3],g[2]), properties:{gardenName:g[1]}})));
    } else if (mapProvider === 'local') {
        updateLocalMap(gardens);
    }
}

function updateLocalMap(gardens) {
    if (!localMapInstance) return;
    const data = gardens.map(g => ({name:g[1], value:[g[2],g[3],g[4] || 2.5]}));
    localMapInstance.setOption({
        tooltip: {trigger:'item', formatter: params => params.seriesType === 'scatter' ? `${params.name}<br>${dynasties[currentEraIndex]}` : params.name},
        geo: {map:'china', roam:true, zoom:1.15, center:[105,35], label:{show:false},
            itemStyle:{areaColor:'#eee7d5', borderColor:'#b7a88c'}, emphasis:{itemStyle:{areaColor:'#d8d6b7'},label:{show:true}}},
        visualMap:{show:false,min:0,max:5,seriesIndex:0,inRange:{color:['rgba(100,160,110,0)','rgba(100,160,110,.45)','#d4a055','#b34f29']}},
        series:[{type:'heatmap',coordinateSystem:'geo',data,pointSize:12,blurSize:18},
            {type:'scatter', coordinateSystem:'geo', data, symbolSize: value => Math.max(7, Math.min(14, value[2] * 2)),
            itemStyle:{color:'#a84928', opacity:.7, shadowBlur:10, shadowColor:'#d78e40'}, emphasis:{itemStyle:{color:'#2d6a4f'},label:{show:true,formatter:'{b}'}}}]
    });
}

function hideMapLoading() {
    const loadingMask = document.getElementById('map-loading');
    if (loadingMask) {
        loadingMask.style.opacity = '0';
        setTimeout(() => {
            loadingMask.style.display = 'none';
        }, 500);
    }
    // 初始化地图交互控制
    initMapInteractiveControl();
}

function initMapInteractiveControl() {
    const mapContainer = document.getElementById('chinaMap');
    if (!mapContainer || mapContainer.dataset.interactionBound) return;
    mapContainer.dataset.interactionBound = 'true';
    window.addEventListener('resize', () => {
        if (mapInstance) mapInstance.resize();
        if (localMapInstance) localMapInstance.resize();
    });
    
    // 点击地图时激活交互模式
    mapContainer.addEventListener('click', (e) => {
        mapInteractiveMode = true;
        clearTimeout(mapInteractiveTimer);
        mapContainer.style.cursor = 'grab';
        
        // 2秒无操作后自动退出交互模式
        mapInteractiveTimer = setTimeout(() => {
            mapInteractiveMode = false;
            mapContainer.style.cursor = 'default';
        }, 2000);
    }, true);
    
    // 鼠标移动时如果在交互模式，保持状态
    mapContainer.addEventListener('mousemove', (e) => {
        if (mapInteractiveMode) {
            clearTimeout(mapInteractiveTimer);
            mapContainer.style.cursor = 'grab';
            // 重新设置定时器
            mapInteractiveTimer = setTimeout(() => {
                mapInteractiveMode = false;
                mapContainer.style.cursor = 'default';
            }, 2000);
        }
    }, true);
    
    // 鼠标离开时退出交互模式
    mapContainer.addEventListener('mouseleave', (e) => {
        mapInteractiveMode = false;
        mapContainer.style.cursor = 'default';
        clearTimeout(mapInteractiveTimer);
    }, true);
    
    // 滚轮事件处理：只在交互模式时允许缩放
    mapContainer.addEventListener('wheel', (e) => {
        if (!mapInteractiveMode) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

function updateGardenList(era) {
    const gardens = gardenData.filter(g => g[0] === era);
    const container = document.getElementById("gardenList");
    if (!container) return; // 容错处理

    if (!gardens.length) {
        container.innerHTML = '<div style="text-align:center; color:#9b7a52; padding:14px;">🌸 园迹暂隐</div>';
        return;
    }
    // 为每个园林项添加点击事件，移除 title 属性以避免浏览器默认的方格提示框
    container.innerHTML = gardens.slice(0, 30).map(g => {
        const name = g[1];
        const safeName = escapeJsSingleQuotedString(name);
        return `<div class="garden-item" onclick="showRichDetail('${safeName}')"><img class="garden-thumb" data-name="${name}"><span class="garden-name">🌺 ${name}</span></div>`;
    }).join('');
    hydrateGardenThumbs(container, era);
}

function refreshByEra() {
    const era = dynasties[currentEraIndex];
    const eraEl = document.getElementById("artEraName");
    const eraSubEl = document.querySelector(".art-sub");
    if (eraEl) {
        const prevEra = dynasties[modEraIndex(currentEraIndex - 1)];
        const nextEra = dynasties[modEraIndex(currentEraIndex + 1)];
        const tooltipText = eraBackgrounds[era] ? eraBackgrounds[era].intro : '';

        if (eraEl.getAttribute('data-era-structure') !== '1') {
            eraEl.innerHTML = `
                <div class="era-mini-arrow" data-era-arrow="up"><i class="fa-solid fa-chevron-up"></i></div>
                <div class="era-seg era-prev" data-era-seg="prev"></div>
                <div class="era-seg era-current" data-era-seg="current"></div>
                <div class="era-seg era-next" data-era-seg="next"></div>
                <div class="era-mini-arrow" data-era-arrow="down"><i class="fa-solid fa-chevron-down"></i></div>
                <div class="era-tooltip"></div>
            `;
            eraEl.setAttribute('data-era-structure', '1');
        }

        const prevEl = eraEl.querySelector('[data-era-seg="prev"]');
        const currentEl = eraEl.querySelector('[data-era-seg="current"]');
        const nextEl = eraEl.querySelector('[data-era-seg="next"]');
        const tooltipEl = eraEl.querySelector('.era-tooltip');
        if (prevEl) prevEl.textContent = prevEra;
        if (currentEl) currentEl.textContent = era;
        if (nextEl) nextEl.textContent = nextEra;
        if (tooltipEl) tooltipEl.textContent = tooltipText;

        const applySize = (el, base, min = 0.85) => {
            if (!el) return;
            const t = String(el.textContent || '');
            const len = Array.from(t).length;
            let size = base;
            if (len >= 6) size = base - 0.75;
            else if (len === 5) size = base - 0.55;
            else if (len === 4) size = base - 0.3;
            el.style.fontSize = `${Math.max(min, size).toFixed(2)}rem`;
        };

        applySize(prevEl, 1.25);
        applySize(currentEl, 1.85, 1.05);
        applySize(nextEl, 1.25);
    }

    if (eraSubEl) {
        const map = {
            "殷周秦汉": "苑 囿 初 成",
            "魏晋南北朝": "寄 情 山 水",
            "隋唐": "盛 世 宫 苑",
            "宋辽金": "写 意 高 峰",
            "元": "清 远 简 逸",
            "明": "造 园 极 盛",
            "清": "集 大 成"
        };
        eraSubEl.innerText = map[era] || "园 林 之 粹";
    }
    
    const eraGardens = gardenData.filter(g => g[0] === era);
    
    updateGardenMap(eraGardens);

    updateGardenList(era);
    updatePieChart(era);
}

function showGardensForRegion(regionName) {
    savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    const era = dynasties[currentEraIndex];
    const gardensInRegion = gardenData.filter(g => g[0] === era && getAreaByLngLat(g[2], g[3]) === regionName);

    const modal = document.getElementById("modal");
    const mTitle = document.getElementById("m-title");
    const mImg = document.getElementById("m-img");
    const mMiniMapBox = document.getElementById("m-mini-map-box");
    const mText = document.getElementById("m-text");
    const ratingSec = document.querySelector('.rating-section');

    mTitle.innerText = `${era} · ${regionName}地区园林`;
    mImg.style.display = 'none';
    if (mMiniMapBox) mMiniMapBox.style.display = 'none';
    if (ratingSec) ratingSec.style.display = 'none';

    let listHtml = gardensInRegion.length > 0
        ? gardensInRegion.map(g => {
            const name = g[1];
            const safeName = escapeJsSingleQuotedString(name);
            return `<div class="garden-item" onclick="showRichDetail('${safeName}')"><img class="garden-thumb" data-name="${name}"><span class="garden-name">🌺 ${name}</span></div>`;
        }).join('')
        : '<p style="text-align:center; color:#9b7a52; padding:14px;">该区域在此朝代暂无园林记录。</p>';

    mText.innerHTML = `
        <div style="padding: 10px 20px;">
            <p style="font-size: 1.1rem; color: var(--title-color); margin-bottom: 15px; text-align:center;">
                共发现 <b>${gardensInRegion.length}</b> 座园林
            </p>
            <div class="garden-list-modal" id="garden-list-modal">${listHtml}</div>
        </div>
    `;
    hydrateGardenThumbs(document.getElementById('garden-list-modal'), era);

    modal.style.display = 'flex';
}


function showEraMiniMap(era) {
    savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    const data = eraBackgrounds[era];
    const modal = document.getElementById("modal");
    const mTitle = document.getElementById("m-title");
    const mImg = document.getElementById("m-img");
    const mMiniMapBox = document.getElementById("m-mini-map-box");
    const mText = document.getElementById("m-text");
    const ratingSec = document.querySelector('.rating-section');
    
    mTitle.innerText = `${era} · 园林风华简图`;
    mImg.style.display = 'none';
    if (mMiniMapBox) mMiniMapBox.style.display = 'block';
    
    if (ratingSec) ratingSec.style.display = 'none';
    
    const eraGardens = gardenData.filter(g => g[0] === era);
    
    const gardenItemsHtml = eraGardens.length > 0
        ? eraGardens.map(g => {
            const name = g[1];
            const safeName = escapeJsSingleQuotedString(name);
            return `<div class="garden-item" onclick="showRichDetail('${safeName}')"><img class="garden-thumb" data-name="${name}"><span class="garden-name">🌺 ${name}</span></div>`;
        }).join('')
        : '<p style="text-align:center; color:#9b7a52; padding:14px;">该朝代暂无详细名录记录。</p>';

    mText.innerHTML = `
        <div style="padding: 10px 20px;">
            <p style="font-size: 1.1rem; color: var(--title-color); margin-bottom: 10px; text-align:center;">
                ${era}时期共有记录园林 <b>${eraGardens.length}</b> 座
            </p>
            <p style="font-size: 0.95rem; line-height: 1.6; color: var(--body-text); text-align: justify; margin-bottom: 20px;">
                ${data.intro}
            </p>
            
            <div class="mini-map-legend" style="margin-bottom: 10px;">
                <div class="legend-item"><span class="legend-dot" style="background:#d4a373;"></span> 北方</div>
                <div class="legend-item"><span class="legend-dot" style="background:#6a994e;"></span> 江南</div>
                <div class="legend-item"><span class="legend-dot" style="background:#bc6c25;"></span> 岭南</div>
                <div class="legend-item"><span class="legend-dot" style="background:#e9c46a;"></span> 中原</div>
            </div>

            <div style="margin-top: 25px;">
                <p style="font-weight: bold; color: var(--emphasis); margin-bottom: 10px; border-bottom: 1px solid var(--bg-divider); padding-bottom: 5px;">
                    <i class="fa-solid fa-list-ul"></i> ${era} · 名园名录 (点击查看详情)
                </p>
                <div class="garden-list-modal" id="garden-list-modal">${gardenItemsHtml}</div>
            </div>
        </div>
    `;
    hydrateGardenThumbs(document.getElementById('garden-list-modal'), era);
    
    modal.style.display = 'flex';
    
    setTimeout(() => {
        initMiniMapChart(era, eraGardens);
    }, 100);
}


function initMiniMapChart(era, gardens) {
    const chartDom = document.getElementById('m-mini-map-box');
    if (!chartDom) return;
    
    // 销毁已有实例，确保内容刷新
    let existingChart = echarts.getInstanceByDom(chartDom);
    if (existingChart) {
        existingChart.dispose();
    }
    
    const myChart = echarts.init(chartDom);
    
    // 转换数据为 ECharts 散点图格式
    const seriesData = gardens.map(g => {
        const area = getAreaByLngLat(g[2], g[3]);
        return {
            name: g[1],
            value: [g[2], g[3], g[4] || 3],
            itemStyle: { color: areaColorMap[area] || '#d4a373' }
        };
    });

    const option = {
        backgroundColor: 'transparent',
        title: {
            text: `${era} 园林空间分布示意`,
            left: 'center',
            top: 10,
            textStyle: { fontSize: 13, color: '#8c603a', fontWeight: 'bold' }
        },
        tooltip: {
            formatter: params => `园林: ${params.name}`
        },
        grid: { top: 50, bottom: 40, left: 50, right: 30 },
        xAxis: { 
            type: 'value', 
            name: '经度',
            min: 73, max: 135, 
            splitLine: { show: true, lineStyle: { color: 'rgba(0,0,0,0.05)' } },
            axisLabel: { fontSize: 10 }
        },
        yAxis: { 
            type: 'value', 
            name: '纬度',
            min: 18, max: 54, 
            splitLine: { show: true, lineStyle: { color: 'rgba(0,0,0,0.05)' } },
            axisLabel: { fontSize: 10 }
        },
        series: [{
            type: 'scatter',
            data: seriesData,
            symbolSize: function (data) {
                return data[2] * 4.5;
            },
            emphasis: {
                itemStyle: {
                    shadowBlur: 10,
                    shadowColor: 'rgba(0, 0, 0, 0.3)'
                }
            }
        }]
    };

    myChart.setOption(option);
    
    // 监听窗口调整
    window.addEventListener('resize', () => myChart.resize());
}

function switchEra(index) {
    if (index === currentEraIndex) return;
    currentEraIndex = index;
    refreshByEra();
}

function modEraIndex(index) {
    const len = dynasties.length;
    return ((index % len) + len) % len;
}

function buildTimeline() {
    const eraEl = document.getElementById("artEraName");
    if (!eraEl) return;
    if (eraEl.getAttribute('data-era-flip') === '1') return;
    eraEl.setAttribute('data-era-flip', '1');

    eraEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY > 0) switchEra(modEraIndex(currentEraIndex + 1));
        else switchEra(modEraIndex(currentEraIndex - 1));
    }, { passive: false });

    eraEl.addEventListener('click', (e) => {
        const arrow = e.target.closest('[data-era-arrow]');
        if (arrow) {
            const dir = arrow.getAttribute('data-era-arrow');
            if (dir === 'up') switchEra(modEraIndex(currentEraIndex - 1));
            else switchEra(modEraIndex(currentEraIndex + 1));
            return;
        }
        const seg = e.target.closest('[data-era-seg]');
        if (!seg) return;
        const role = seg.getAttribute('data-era-seg');
        if (role === 'prev') {
            switchEra(modEraIndex(currentEraIndex - 1));
            return;
        }
        if (role === 'next') {
            switchEra(modEraIndex(currentEraIndex + 1));
            return;
        }
        showEraMiniMap(dynasties[currentEraIndex]);
    });
}


function toggleNightMode() {
    const body = document.body;
    const btn = document.querySelector('.theme-toggle');
    body.classList.toggle('night-mode');
    
    const isNightMode = body.classList.contains('night-mode');
    
    // 改用 sessionStorage 保存（关闭浏览器后自动清除）
    GardenApp.storage.set('nightMode', isNightMode);
    
    if (isNightMode) {
        btn.innerHTML = '<i class="fa-solid fa-sun"></i> 白昼模式';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-moon"></i> 夜游园林';
    }
    
    // 重新渲染需要刷新的图表
    if (document.getElementById('sankey-chart') && typeof initSankeyChart === 'function') {
        setTimeout(initSankeyChart, 50);
    }
    if (document.getElementById('school-tree') && typeof initSchoolTree === 'function') {
        setTimeout(initSchoolTree, 50);
    }
}


// 页面加载时恢复夜游模式状态
function restoreNightMode() {
    const isNightMode = GardenApp.storage.get('nightMode', false) === true;
    const btn = document.querySelector('.theme-toggle');
    
    if (isNightMode) {
        document.body.classList.add('night-mode');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-sun"></i> 白昼模式';
        }
    } else {
        document.body.classList.remove('night-mode');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-moon"></i> 夜游园林';
        }
    }
}

function openSubPage(cat) {
    document.getElementById('category-view').style.display = 'none';
    document.getElementById('sub-' + cat).style.display = 'block';
}
function closeSubPage() {
    document.querySelectorAll('.sub-page').forEach(p => p.style.display = 'none');
    document.getElementById('category-view').style.display = 'block';
}

// --- 动态水墨粒子系统 ---
let inkCanvas = null;
let inkCtx = null;
let customCursor = null;

function initCustomCursor() {
    // 动态创建鼠标小花元素
    if (!document.getElementById('custom-cursor')) {
        customCursor = document.createElement('div');
        customCursor.id = 'custom-cursor';
        customCursor.innerHTML = '<i class="fa-solid fa-fan flower-icon"></i>';
        document.body.appendChild(customCursor);
    }

    // 追踪鼠标位置
    window.addEventListener('mousemove', (e) => {
        if (customCursor) {
            // 使用 requestAnimationFrame 优化平滑度
            requestAnimationFrame(() => {
                customCursor.style.left = e.clientX + 'px';
                customCursor.style.top = e.clientY + 'px';
            });
        }

        // 原有的鼠标移动产生粒子逻辑
        if (Math.random() < 0.15) {
            let p = new InkParticle(e.clientX, e.clientY);
            p.size = 6; 
            particles.push(p);
        }
    });

    // 交互反馈：按下
    window.addEventListener('mousedown', () => {
        if (customCursor) customCursor.classList.add('active');
    });
    window.addEventListener('mouseup', () => {
        if (customCursor) customCursor.classList.remove('active');
    });

    // 交互反馈：悬停在可点击元素上
    const interactiveElements = 'a, button, .tab, .cat-card, .g-card, .garden-item, .dynasty-btn, .fragment';
    document.addEventListener('mouseover', (e) => {
        if (e.target.closest(interactiveElements)) {
            if (customCursor) customCursor.classList.add('hover');
        }
    });
    document.addEventListener('mouseout', (e) => {
        if (!e.target.closest(interactiveElements)) {
            if (customCursor) customCursor.classList.remove('hover');
        }
        // 当鼠标离开窗口时隐藏自定义鼠标
        if (!e.relatedTarget && !e.toElement) {
            if (customCursor) customCursor.style.display = 'none';
        }
    });
    document.addEventListener('mouseenter', () => {
        if (customCursor) customCursor.style.display = 'flex';
    });
}

function initInkSystem() {
    inkCanvas = document.getElementById('ink-canvas');
    if (!inkCanvas) return;
    inkCtx = inkCanvas.getContext('2d');
    
    window.addEventListener('resize', resizeInkCanvas);
    resizeInkCanvas();
    animateInk();
}

function resizeInkCanvas() {
    if (!inkCanvas) return;
    inkCanvas.width = window.innerWidth;
    inkCanvas.height = window.innerHeight;
}
// window.addEventListener('resize', resizeInkCanvas); // 已在 initPage 中处理
// resizeInkCanvas();

class InkParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 1;
        this.maxSize = Math.random() * 30 + 15;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5 - 0.2; 
        this.life = 1.0; 
        this.decay = Math.random() * 0.015 + 0.01;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.size < this.maxSize) this.size += 1.0; 
        this.life -= this.decay;
    }
    draw() {
        const style = getComputedStyle(document.body);
        const rawColor = style.getPropertyValue('--ink-color').trim();
        const rgbaMatch = rawColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        if(rgbaMatch) {
            inkCtx.fillStyle = `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${this.life * 0.15})`;
        } else {
            inkCtx.fillStyle = `rgba(0,0,0, ${this.life * 0.1})`;
        }
        inkCtx.beginPath();
        inkCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        inkCtx.fill();
    }
}

function animateInk() {
    inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
    if(Math.random() < 0.03) {
        particles.push(new InkParticle(Math.random() * inkCanvas.width, Math.random() * inkCanvas.height));
    }
    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
            i--;
        }
    }
    requestAnimationFrame(animateInk);
}
// animateInk(); // 已在 initPage 中处理

window.addEventListener('mousemove', (e) => {
    if (Math.random() < 0.15) {
        let p = new InkParticle(e.clientX, e.clientY);
        p.size = 6; 
        particles.push(p);
    }
});

function showRichDetail(key) {
    // 保存当前滚动位置
    savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    
    // 锁定页面滚动
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    
    currentGarden = key;
    const modal = document.getElementById('modal');
    const data = richDB[key];
    const ratingSec = document.querySelector('.rating-section');
    const mImg = document.getElementById('m-img');
    const mMiniMapBox = document.getElementById("m-mini-map-box");
    const era = findGardenMetaByName(key)?.[0] || dynasties[currentEraIndex];
    const fallback = eraFallbackImgMap[era] || "image/盆景.jpg";
    
    // 先设置标题
    document.getElementById('m-title').innerText = `${era} · ${key}`;
    
    if(data) {
        document.getElementById('m-title').innerText = data.title;
    }
    
    // 设置图片
    mImg.style.display = 'block';
    mImg.className = 'result-img';
    if (mMiniMapBox) mMiniMapBox.style.display = 'none';
    
    // 获取园林详情 HTML
    let detailHtml = '';
    if (data && stripHtmlText(data.content).length >= 180) {
        // 有详细内容且长度足够，直接使用
        detailHtml = data.content;
    } else {
        // 使用自动生成的内容
        const autoHtml = buildAutoGardenDetailHtml(key, era, data ? data.content : '');
        detailHtml = autoHtml;
    }
    
    // 直接设置内容，不要额外包裹
    document.getElementById('m-text').innerHTML = detailHtml;
    
    // 设置图片
    if (data && data.img) {
        setImageWithFallback(mImg, [data.img, ...buildGardenImageCandidates(key, era)], fallback);
    } else {
        setImageWithFallback(mImg, buildGardenImageCandidates(key, era), fallback);
    }
    
    if (ratingSec) ratingSec.style.display = 'flex'; 
    
    updateStarsUI(userRatings[key] || 0);
    modal.style.display = 'flex';
}

function closeModal() { 
    const modal = document.getElementById('modal');
    if (modal) {
        modal.style.display = 'none';
    }
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    if (savedScrollPosition) {
        window.scrollTo(0, savedScrollPosition);
        savedScrollPosition = 0;
    }
}

function showMasterpiece(name) {
    const data = figureDetails[name];
    if (!data) return;
    savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    
    const modal = document.getElementById('modal');
    const mTitle = document.getElementById('m-title');
    const mImg = document.getElementById('m-img');
    const mText = document.getElementById('m-text');
    const mMiniMapBox = document.getElementById("m-mini-map-box");
    const ratingSec = document.querySelector('.rating-section');
    
    mTitle.innerText = `${name} · 艺术成就与造园哲学`;
    
    if (mMiniMapBox) mMiniMapBox.style.display = 'none';
    if (ratingSec) ratingSec.style.display = 'none';
    
    const worksHtml = data.works ? data.works.map(w => `<span class="work-tag">${w}</span>`).join('') : '';
    const quotesHtml = data.moreQuotes ? data.moreQuotes.map(q => `<p class="extra-quote">"${q}"</p>`).join('') : '';

    mText.innerHTML = `
        <div class="figure-detail-content">
            <div class="figure-detail-header">
                <div class="image-section">
                    <img src="${data.mImg}" class="result-img" alt="${name}" />
                </div>
                <div class="text-section">
                    <div class="detail-block">
                        <h4><i class="fa-solid fa-gem"></i> 核心代表作：</h4>
                        <div class="content-wrapper">
                            <p style="font-weight: 600; color: var(--emphasis);">${data.masterpiece}</p>
                            <p style="margin-top: 8px;">${data.mDesc}</p>
                            <div class="works-grid">${worksHtml}</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="quote-section">
                <i class="fa-solid fa-quote-left"></i>
                <p class="main-quote">${data.quote}</p>
                <i class="fa-solid fa-quote-right"></i>
            </div>

            <div class="detail-block">
                <h4><i class="fa-solid fa-scroll"></i> 造园哲学：</h4>
                <div class="content-wrapper">
                    <p>${data.philosophy}</p>
                </div>
            </div>

            <div class="detail-block">
                <h4><i class="fa-solid fa-clock-rotate-left"></i> 历史轶事：</h4>
                <div class="content-wrapper">
                    <p>${data.history}</p>
                </div>
            </div>

            <div class="detail-block">
                <h4><i class="fa-solid fa-feather-pointed"></i> 更多名言：</h4>
                <div class="content-wrapper">
                    <div class="quotes-list">${quotesHtml}</div>
                </div>
            </div>
        </div>
    `;
    
    mImg.style.display = 'none';
    modal.style.display = 'flex';
}


function showTimelineDetail(stage) {
    savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    const data = timelineDetails[stage];
    if (!data) return;
    
    const modal = document.getElementById('modal');
    const mTitle = document.getElementById('m-title');
    const mImg = document.getElementById('m-img');
    const mText = document.getElementById('m-text');
    const mMiniMapBox = document.getElementById("m-mini-map-box");
    const ratingSec = document.querySelector('.rating-section');
    
    mTitle.innerText = data.title;
    mImg.src = data.img;
    mImg.style.display = 'block';
    mImg.className = 'result-img';
    
    if (mMiniMapBox) mMiniMapBox.style.display = 'none';
    if (ratingSec) ratingSec.style.display = 'none';
    
    mText.innerHTML = `
        <div class="result-text" style="padding: 0 10px;">
            ${data.content}
        </div>
    `;
    
    modal.style.display = 'flex';
}



function showTimelineSubDetail(stage, item, timelineMeta) {
    // 保存当前滚动位置
    savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    if (!item) return;
    const modal = document.getElementById('modal');
    const mTitle = document.getElementById('m-title');
    const mImg = document.getElementById('m-img');
    const mText = document.getElementById('m-text');
    const mMiniMapBox = document.getElementById("m-mini-map-box");
    const ratingSec = document.querySelector('.rating-section');

    const stageData = (typeof timelineDetails !== 'undefined') ? timelineDetails[stage] : null;
    const era = timelineMeta?.era || '';
    const years = item.years || '';
    const tags = (item.tags || []).join('、');

    if (mTitle) mTitle.innerText = `${era} · ${item.label}`;
    if (mImg && stageData?.img) {
        mImg.src = stageData.img;
        mImg.style.display = 'block';
        mImg.className = 'result-img';
    } else if (mImg) {
        mImg.style.display = 'none';
    }
    if (mMiniMapBox) mMiniMapBox.style.display = 'none';
    if (ratingSec) ratingSec.style.display = 'none';

    const stageSummary = stageData ? stripHtmlText(stageData.content) : '';
    const short = stageSummary ? (stageSummary.length > 220 ? `${stageSummary.slice(0, 220)}…` : stageSummary) : '';

    if (mText) {
        mText.innerHTML = `
            <div class="result-text" style="padding: 0 10px;">
                <div class="detail-block">
                    <h4>所属阶段</h4>
                    <p>${stage}</p>
                </div>
                <div class="detail-block">
                    <h4>时间范围</h4>
                    <p>${years}</p>
                </div>
                <div class="detail-block">
                    <h4>关键词</h4>
                    <p>${tags || '—'}</p>
                </div>
                ${short ? `
                    <div class="detail-block">
                        <h4>阶段要点</h4>
                        <p>${short}</p>
                    </div>
                ` : ''}
            </div>
        `;
    }

    if (modal) modal.style.display = 'flex';
}

const stars = document.querySelectorAll('#star-container i');
stars.forEach(star => {
    star.addEventListener('mouseover', function() {
        let val = parseInt(this.getAttribute('data-val'));
        updateStarsUI(val, true);
    });
    star.addEventListener('mouseout', function() {
        updateStarsUI(userRatings[currentGarden] || 0);
    });
    star.addEventListener('click', function(event) {
        let val = parseInt(this.getAttribute('data-val'));
        userRatings[currentGarden] = val;
        GardenApp.storage.set('gardenRatings', userRatings); 
        updateStarsUI(val);
        const p = new InkParticle(event.clientX, event.clientY);
        p.size = 15; 
        particles.push(p); 
    });
});

function updateStarsUI(rating, isHover = false) {
    stars.forEach(s => {
        if (parseInt(s.getAttribute('data-val')) <= rating) {
            s.className = 'fa-solid fa-star active';
        } else {
            s.className = 'fa-solid fa-star'; 
            s.classList.remove('active');
        }
    });
    const textEl = document.getElementById('rating-score-text');
    if (!textEl) return;
    if (rating === 0 && !isHover) textEl.innerText = '暂未评分';
    else if (rating === 5) textEl.innerText = '5.0 绝美神作！';
    else if (rating === 4) textEl.innerText = '4.0 值得一游';
    else textEl.innerText = rating + '.0 分';
}

// --- 营造小游戏逻辑 ---
function renderGame() {
    const board = document.getElementById('game-board');
    if (!board) return;
    board.innerHTML = '';
    [...fragments].sort(() => Math.random() - 0.5).forEach(f => {
        const div = document.createElement('div');
        div.className = 'fragment';
        div.innerHTML = `<i class="fa-solid ${f.icon}"></i><span style="color: var(--title-color);">${f.name}</span>`;
        div.onclick = () => {
            if (selectedFragments.includes(f)) {
                selectedFragments = selectedFragments.filter(i => i.id !== f.id);
                div.classList.remove('selected');
            } else {
                if (selectedFragments.length >= 3) { alert('最多只能选择 3 个构件！'); return; }
                selectedFragments.push(f);
                div.classList.add('selected');
            }
        };
        board.appendChild(div);
    });
}

function checkGameResult() {
    if (selectedFragments.length < 3) { 
        alert('请收集齐 3 个碎片再进行组合！'); 
        return; 
    }
    const isSuccess = selectedFragments.every(f => f.type === 'target');
    const modal = document.getElementById('modal');
    
    // ✅ 加判断，防止报错
    const ratingSection = document.querySelector('.rating-section');
    if (ratingSection) {
        ratingSection.style.display = 'none';
    }
    
    if (isSuccess) {
        const mTitle = document.getElementById('m-title');
        const mImg = document.getElementById('m-img');
        const mText = document.getElementById('m-text');
        
        if (mTitle) mTitle.innerText = '🎉 营造成功：再现江南雅韵';
        if (mImg) {
            mImg.src = "image/拙政园2.png";
            mImg.style.width = '260px';     
            mImg.style.height = 'auto';      
            mImg.style.margin = '15px auto';
            mImg.style.display = 'block';
        }
        if (mText) {
            mText.innerHTML = '<p style="font-size:18px; text-align:center;"><b style="color: var(--title-color);">太棒了！</b>你准确捕捉到了江南私家园林的精髓。粉墙黛瓦的素雅、漏窗借景的巧妙、太湖奇石的瘦透漏皱，共同构筑了文人墨客心中的精神家园。</p>';
        }
    } else {
        const mTitle = document.getElementById('m-title');
        const mImg = document.getElementById('m-img');
        const mText = document.getElementById('m-text');
        
        if (mTitle) mTitle.innerText = '❌ 营造失败：风格冲突';
        if (mImg) mImg.style.display = 'none';
        if (mText) {
            mText.innerHTML = '<p style="font-size:18px; text-align:center;">哎呀，似乎混入了皇家园林（如琉璃瓦、汉白玉）或岭南园林（如满洲窗）的特征，破坏了江南园林的清幽雅致。请取消错误选项重新尝试！</p>';
        }
    }
    
    // 关闭按钮逻辑
    const modalClose = document.querySelector('.modal-close');
    if (modalClose) {
        const oldClose = modalClose.onclick;
        modalClose.onclick = function() {
            closeModal();
            setTimeout(() => { 
                const ratingSection = document.querySelector('.rating-section');
                if (ratingSection) {
                    ratingSection.style.display = 'flex';
                }
            }, 300);
            modalClose.onclick = closeModal; 
        };
    }
    
    if (modal) modal.style.display = 'flex';
}

// --- 时间轴滚动触发动画 ---
function initTimelineObserver() {
    const timelineContainer = document.getElementById('timeline-container');
    if (!timelineContainer) return;
    
    // 创建Intersection Observer实例
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // 当时间轴进入视口时，添加active类触发动画
            if (entry.isIntersecting) {
                timelineContainer.classList.add('active');
                // 可选：进入后就不需要再观察了，节省性能
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1  // 当时间轴有10%进入视口时触发
    });
    
    observer.observe(timelineContainer);
}

// --- 3D 文字地球 ---
function init3DWordCloud() {
    const canvas = document.getElementById('wordcloud-3d');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width, height = canvas.height;
    let cx = width / 2, cy = height / 2;
    const radius = 220;
    
    let tags = [];
    let mouseX = 40, mouseY = -40;

    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < words3D.length; i++) {
        let y = 1 - (i / (words3D.length - 1)) * 2;
        let radiusAtY = Math.sqrt(1 - y * y);
        let theta = phi * i;
        let x = Math.cos(theta) * radiusAtY;
        let z = Math.sin(theta) * radiusAtY;
        tags.push({ x: x * radius, y: y * radius, z: z * radius, text: words3D[i].text, size: words3D[i].size, color: words3D[i].c });
    }

    function rotateX(angle) {
        let cos = Math.cos(angle), sin = Math.sin(angle);
        tags.forEach(t => { let y1 = t.y * cos - t.z * sin; let z1 = t.z * cos + t.y * sin; t.y = y1; t.z = z1; });
    }
    function rotateY(angle) {
        let cos = Math.cos(angle), sin = Math.sin(angle);
        tags.forEach(t => { let x1 = t.x * cos + t.z * sin; let z1 = t.z * cos - t.x * sin; t.x = x1; t.z = z1; });
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        rotateX(mouseY * 0.0001); rotateY(mouseX * 0.0001);
        
        let sorted = tags.slice().sort((a, b) => a.z - b.z);
        sorted.forEach(t => {
            let scale = radius / (radius - t.z * 0.6); 
            let alpha = (t.z + radius) / (2 * radius); 
            alpha = Math.max(0.15, alpha);

            ctx.save();
            ctx.translate(cx + t.x * scale, cy + t.y * scale);
            ctx.scale(scale, scale);
            ctx.globalAlpha = alpha;
            
            if (document.body.classList.contains('night-mode')) {
                ctx.shadowColor = t.color; ctx.shadowBlur = 10; ctx.fillStyle = '#fff';
            } else {
                ctx.shadowBlur = 0; ctx.fillStyle = t.color; 
            }

            ctx.font = `bold ${t.size}px "Noto Serif SC", serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(t.text, 0, 0);
            ctx.restore();
        });
        requestAnimationFrame(draw);
    }

    canvas.addEventListener('mousemove', e => {
        let rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left - cx;
        mouseY = e.clientY - rect.top - cy;
    });
    canvas.addEventListener('mouseleave', () => { mouseX = 40; mouseY = -40; }); 
    draw(); 
}

function initSankeyChart() {
    const chartDom = document.getElementById('sankey-chart');
    if (!chartDom) return;
    
    // 先销毁已有实例，避免内存问题
    let existingChart = echarts.getInstanceByDom(chartDom);
    if (existingChart) {
        existingChart.dispose();
    }
    
    const myChart = echarts.init(chartDom);
    
    // 定义四层节点顺序
    const layerOrder = [
        "《园冶》", "《林泉高致》", "《闲情偶寄》", "《长物志》", 
        "《洛阳名园记》", "《浮生六记》", "《营造法原》", 
        "《芥子园画谱》", "《扬州画舫录》", "《洛阳伽蓝记》",
        "天人合一", "巧于因借", "宛自天开", "壶中天地", "诗画意境", 
        "比德", "叠山理水", "对景借景", "框景漏景", "曲折幽深", "因地制宜",
        "拙政园", "留园", "环秀山庄", "网师园", "沧浪亭", 
        "颐和园", "狮子林", "艺圃", "耦园", "退思园",
        "现代景观空间理论", "生态修复与海绵城市", "乡土材料与技艺复兴", 
        "公共园林与社区设计", "建筑与室内意境营造", "文化遗产保护理念", "生态文化景观"
    ];
    
    const sortedNodes = layerOrder.map(name => {
        const node = sankeyData.nodes.find(n => n.name === name);
        return node || { name: name };
    });
    
    const fixLinkName = (name) => {
        const map = {
            "天人合一 / 道法自然": "天人合一",
            "天人合一 ": "天人合一",
            "巧于因借，精在体宜": "巧于因借",
            "壶中天地 / 小中见大": "壶中天地",
            "框景漏景 / 步移景异": "框景漏景",
            "曲折幽深 (空间序列)": "曲折幽深"
        };
        return map[name] || name;
    };
    
    const fixedLinks = sankeyData.links
        .map(link => ({
            source: fixLinkName(link.source),
            target: fixLinkName(link.target),
            value: link.value
        }))
        .filter(link => {
            const sourceExists = layerOrder.includes(link.source);
            const targetExists = layerOrder.includes(link.target);
            return sourceExists && targetExists && link.source !== link.target;
        });
    
    const uniqueLinks = [];
    const linkMap = new Map();
    fixedLinks.forEach(link => {
        const key = `${link.source}|${link.target}`;
        if (linkMap.has(key)) {
            linkMap.get(key).value += link.value;
        } else {
            linkMap.set(key, { ...link });
            uniqueLinks.push(linkMap.get(key));
        }
    });
    
    // 获取当前是否是夜游模式
    const isNightMode = document.body.classList.contains('night-mode');
    
    // 夜游模式颜色配置
    const nightModeColors = {
    title: '#c9b896',           // 标题浅金色
    tooltipBg: 'rgba(22, 35, 29, 0.98)',
    tooltipBorder: '#b8a07c',
    tooltipText: '#e8dfd3',
    nodeLabel: '#ddd6cc',        // 节点标签暖米白
    linkColor: '#8a9a8e',        // 连接线用柔和的灰绿色，不刺眼
    linkOpacity: 0.4,
    nodeBorderColor: '#6a7a6e'
};
    
    // 白昼模式颜色配置
    const dayModeColors = {
        title: '#8b3a3a',
        tooltipBg: 'rgba(255, 255, 255, 0.95)',
        tooltipBorder: '#d4a373',
        tooltipText: '#4a3e36',
        nodeLabel: '#4a3e36',
        linkColor: 'source',
        linkOpacity: 0.12,
        nodeBorderColor: 'transparent'
    };
    
    const colors = isNightMode ? nightModeColors : dayModeColors;
    
    // 获取节点颜色（根据模式调整）
    function getNodeColorWithMode(name) {
    if (!isNightMode) return getNodeColor(name);
    
    // 夜游模式分层配色
    if (layerOrder.slice(0, 10).includes(name)) {
        return '#a89070';        // 著作层 - 陶土色
    }
    if (layerOrder.slice(10, 21).includes(name)) {
        return '#7a9a7a';        // 理念层 - 苔绿色
    }
    if (layerOrder.slice(21, 31).includes(name)) {
        return '#6a8a9a';        // 园林层 - 雾霾蓝
    }
    return '#9a8a6a';             // 现代影响层 - 香槟色
}
    
    const option = {
        title: {
            text: '园林智慧传承谱系图',
            left: 'center',
            top: 6,
            textStyle: {
                color: colors.title,
                fontSize: 22,
                fontFamily: '华文行楷, STKaiti, serif',
                textShadowBlur: 5,
                textShadowColor: 'rgba(0,0,0,0.1)'
            }
        },
        tooltip: {
            trigger: 'item',
            triggerOn: 'mousemove',
            backgroundColor: colors.tooltipBg,
            borderColor: colors.tooltipBorder,
            borderWidth: 1,
            textStyle: { color: colors.tooltipText, fontSize: 13 },
            formatter: function(params) {
                if (params.dataType === 'node') {
                    const idx = layerOrder.indexOf(params.name);
                    let layerTag = '';
                    if (idx >= 0 && idx < 10) layerTag = '📖 著作';
                    else if (idx >= 10 && idx < 21) layerTag = '🎋 理念与手法';
                    else if (idx >= 21 && idx < 31) layerTag = '🏯 古代园林';
                    else layerTag = '🌿 现代影响';
                    const nodeColor = isNightMode ? '#d4b886' : '#8b3a3a';
                    return `<div style="padding:5px;">
                                <b style="color:${nodeColor}; font-size:15px;">${params.name}</b><br/>
                                <span style="color:${isNightMode ? '#c9b896' : '#666'};">${layerTag}</span><br/>
                                <span style="color:${isNightMode ? '#a0907c' : '#999'}; font-size:11px;">点击查看详细信息</span>
                            </div>`;
                }
                const fromColor = isNightMode ? '#d4b886' : '#b87a3a';
                const toColor = isNightMode ? '#d4b886' : '#b87a3a';
                return `<div style="padding:5px;">
                            <span style="color:${fromColor};">从：</span>${params.data.source}<br/>
                            <span style="color:${toColor};">至：</span>${params.data.target}<br/>
                            <span style="color:${isNightMode ? '#d4b886' : '#8b3a3a'};">关联权重：</span>${params.data.value}
                        </div>`;
            }
        },
        series: [
            {
                type: 'sankey',
                left: 12,
                right: 190,
                top: 64,
                bottom: 120,
                data: sortedNodes.map(node => ({
                    name: node.name,
                    itemStyle: {
                        color: getNodeColorWithMode(node.name),
                        borderColor: colors.nodeBorderColor,
                        borderWidth: isNightMode ? 1 : 0,
                        opacity: 0.95
                    }
                })),
                links: uniqueLinks,
                emphasis: {
                    focus: 'adjacency',
                    lineStyle: {
                        opacity: 0.9,
                        color: colors.linkColor
                    }
                },
                lineStyle: {
                    color: colors.linkColor,
                    curveness: 0.45,
                    opacity: colors.linkOpacity
                },
                label: {
                    color: colors.nodeLabel,
                    fontFamily: 'STKaiti, serif',
                    fontSize: 12,
                    position: 'right',
                    distance: 8,
                    width: 110,
                    overflow: 'truncate'
                },
                layoutIterations: 64,
                nodeAlign: 'justify',
                nodeWidth: 8,
                nodeGap: 12,
                draggable: true
            }
        ]
    };

    myChart.setOption(option);
    
    myChart.on('click', function(params) {
        if (params.dataType === 'node') {
            showSankeyDetail(params.name);
        }
    });

    window.addEventListener('resize', () => myChart.resize());
}

function getNodeColor(name) {
    // 第1层：著作 (10个)
    const layer1 = [
        "《园冶》", "《林泉高致》", "《闲情偶寄》", "《长物志》", 
        "《洛阳名园记》", "《浮生六记》", "《营造法原》", 
        "《芥子园画谱》", "《扬州画舫录》", "《洛阳伽蓝记》"
    ];
    
    // 第2层：理念与手法 (11个)
    const layer2 = [
        "天人合一", "巧于因借", "宛自天开", "壶中天地", "诗画意境", 
        "比德", "叠山理水", "对景借景", "框景漏景", "曲折幽深", "因地制宜"
    ];
    
    // 第3层：古代园林 (10个)
    const layer3 = [
        "拙政园", "留园", "环秀山庄", "网师园", "沧浪亭", 
        "颐和园", "狮子林", "艺圃", "耦园", "退思园"
    ];
    
    // 第4层：现代影响 (7个)
    const layer4 = [
        "现代景观空间理论", "生态修复与海绵城市", "乡土材料与技艺复兴", 
        "公共园林与社区设计", "建筑与室内意境营造", "文化遗产保护理念", "生态文化景观"
    ];
    
    if (layer1.includes(name)) return '#c0392b';
    if (layer2.includes(name)) return '#8e44ad';
    if (layer3.includes(name)) return '#27ae60';
    if (layer4.includes(name)) return '#e67e22';
    
    // 兼容旧数据
    const oldLayer1 = ["秦汉宫苑", "魏晋私园", "隋唐御苑", "宋代文人园", "明代造园热", "清代皇家园林"];
    const oldLayer2 = ["《营造法式》", "《说园》", "因借体宜", "虽由人作", "情景交融"];
    const oldLayer3 = ["太湖石叠山", "黄石叠山", "聚散理水", "曲水流觞", "框景漏窗", "对景借景", "花木配植", "铺地艺术", "木构装修", "彩画装饰", "空间布局", "借景手法"];
    const oldLayer4 = ["个园", "寄畅园", "豫园", "圆明园", "避暑山庄"];
    const oldLayer5 = ["现代景观设计", "生态智慧", "东方美学", "诗意栖居"];
    
    if (oldLayer1.includes(name)) return '#c0392b';
    if (oldLayer2.includes(name)) return '#8e44ad';
    if (oldLayer3.includes(name)) return '#27ae60';
    if (oldLayer4.includes(name)) return '#3498db';
    if (oldLayer5.includes(name)) return 'orange';
    
    return '#95a5a6';
}

// 专属桑基详情展示逻辑
function showSankeyDetail(name) {
    // 在 showSankeyDetail 函数内，替换 sankeyNodeDetails 为以下内容

const sankeyNodeDetails = {
    // ==================== 第1层：著作 ====================
    "《园冶》": {
        impact: '明代计成所著，是中国乃至世界第一部系统论述造园艺术的专著。提出"虽由人作，宛自天开""巧于因借，精在体宜"等核心理念。',
        significance: '《园冶》的造园哲学对现代景观设计具有普遍指导意义，是园林从业者的必读经典。'
    },
    "《林泉高致》": {
        impact: '北宋郭熙的山水画论著作，提出"三远法"构图理论与"可行可望可游可居"的审美标准。',
        significance: '《林泉高致》的空间构图理论为现代景观设计的视觉组织提供了经典范式。'
    },
    "《闲情偶寄》": {
        impact: '清代李渔的著作，以独特视角探讨园林建筑与日常生活美学，对窗景设计、空间趣味提出了创新见解。',
        significance: '《闲情偶寄》的实用美学思想对现代人性化景观设计具有指导价值。'
    },
    "《长物志》": {
        impact: '明代文震亨的著作，系统论述文人生活的审美标准与物品鉴赏原则，确立了文人园林的雅致格调。',
        significance: '《长物志》的雅致美学对现代精品空间设计、高端居住景观具有重要启发。'
    },
    "《洛阳名园记》": {
        impact: '宋代李格非所著，记录了北宋洛阳19处著名园林的盛况，是研究宋代私家园林的重要文献。',
        significance: '《洛阳名园记》为现代园林史研究提供了宝贵的第一手资料。'
    },
    "《浮生六记》": {
        impact: '清代沈复的自传体散文，生动记录了作者与妻子在园林中的生活美学。',
        significance: '《浮生六记》所展现的园居生活美学，推动了"诗意栖居"理念的传播。'
    },
    "《营造法原》": {
        impact: '姚承祖所著，系统总结了江南地区传统建筑的营造技艺，是研究江南园林建筑的重要技术典籍。',
        significance: '《营造法原》为现代古建修复与传统工艺传承提供了权威的技术规范。'
    },
    "《芥子园画谱》": {
        impact: '清代王概等编撰的中国画经典教科书，其山水、树石画法为园林"以画入园"提供了直接的构图与造型范本。',
        significance: '《芥子园画谱》的构图法则对现代景观设计的视觉组织具有重要启发。'
    },
    "《扬州画舫录》": {
        impact: '清代李斗所著，是扬州园林、城市、文化的百科全书，详细记录了瘦西湖及诸多名园的布局与生活。',
        significance: '为现代园林史研究提供了宝贵资料，其记录方法对当代文化遗产普查具有参考价值。'
    },
    "《洛阳伽蓝记》": {
        impact: '北魏杨衒之所著，记述洛阳佛寺的著作，包含了早期寺庙园林的珍贵史料。',
        significance: '为现代园林史研究提供了早期寺庙园林的珍贵资料。'
    },
    
    // ==================== 第2层：理念与手法 ====================
    "天人合一": {
        impact: '中国哲学的核心命题，在园林中体现为人与自然的和谐共生，是中国园林区别于其他园林体系的根本特征。',
        significance: '对当代生态景观设计具有普遍指导意义，在现代生态文明建设中发挥重要作用。'
    },
    "巧于因借": {
        impact: '《园冶》提出的核心造园原则，强调因地制宜、借景造境，体现顺应自然的生态智慧。',
        significance: '高度契合当代可持续景观设计原则，在现代生态修复、低干预景观设计中得到广泛应用。'
    },
    "宛自天开": {
        impact: '园林营造的最高境界，追求人工景观如同自然生成，要求造园者创造"非刻意"的自然美感。',
        significance: '对现代自然式景观设计具有深远影响，在当代生态景观、野趣花园设计中得到体现。'
    },
    "壶中天地": {
        impact: '中国园林的空间哲学，在有限空间内创造无限意境，使小空间产生大尺度的空间体验。',
        significance: '为现代高密度城市中的小游园、口袋公园、庭院设计提供重要参考。'
    },
    "诗画意境": {
        impact: '中国园林的核心审美追求，将诗画艺术融入园林营造，使园林成为"立体的画、凝固的诗"。',
        significance: '为当代新中式景观提供了审美范本，推动传统园林精神在现代城市更新中延续。'
    },
    "比德": {
        impact: '将植物的自然属性与人的道德品格相联系，使园林植物承载文化内涵与精神寄托。',
        significance: '对现代文化景观的植物配置具有启发意义，在纪念性园林、文化空间中广泛应用。'
    },
    "叠山理水": {
        impact: '中国园林的核心造园技艺，通过堆叠山石和开凿水系营造自然山水格局。',
        significance: '为现代景观设计提供经典范式，对当代海绵城市建设具有重要启发。'
    },
    "对景借景": {
        impact: '通过设置视觉焦点和借用园外景物，拓展空间边界，创造无限意境。',
        significance: '对现代景观视线设计具有重要指导价值，在城市景观廊道、观景平台设计中广泛应用。'
    },
    "框景漏景": {
        impact: '通过门窗洞口框景、漏窗透景，创造"画中有画"的视觉效果和若隐若现的层次感。',
        significance: '对现代建筑立面与景观节点设计具有广泛影响，在幕墙设计、景观构筑中广泛应用。'
    },
    "曲折幽深": {
        impact: '通过曲折路径、幽深庭院营造"曲径通幽"的空间意境，增加层次感与神秘感。',
        significance: '对现代高密度城市中的小游园、口袋公园设计具有重要参考价值。'
    },
    "因地制宜": {
        impact: '《园冶》提出的核心原则，强调根据地形、水文等自然条件灵活布局，不强行改造自然。',
        significance: '高度契合当代可持续景观设计原则，在现代生态修复、低干预景观设计中广泛应用。'
    },
    
    // ==================== 第3层：古代园林 ====================
    "拙政园": {
        impact: '明代文人园林巅峰代表，以水为核心、疏朗自然的布局奠定江南文人园林基本范式。',
        significance: '为现代景观设计提供"诗意造景"经典思路，是传播中国园林文化的重要载体。'
    },
    "留园": {
        impact: '以极致空间艺术著称，通过曲折回廊、精巧框景，在有限场地创造丰富空间体验。',
        significance: '"小中见大"空间策略为高密度城市小游园、口袋公园提供重要参考。'
    },
    "环秀山庄": {
        impact: '以叠山艺术闻名，戈裕良运用"钩带法"营造的假山被誉为"湖石假山之冠"。',
        significance: '为现代景观石景设计提供经典范式，其叠山技艺在当代假山营造中具有重要价值。'
    },
    "网师园": {
        impact: '小型文人园林极致典范，"小园极则"著称，于方寸间营造深远意境。',
        significance: '为现代庭院、屋顶花园、精品酒店景观提供直接设计参考，推动中国古典园林国际化传播。'
    },
    "沧浪亭": {
        impact: '苏州现存最古老园林，宋代文人园林开山之作，开创性地将园外水系借入园内。',
        significance: '开放共享理念对现代城市公园设计具有重要启示，简约古雅风格为当代新中式景观提供审美范本。'
    },
    "颐和园": {
        impact: '清代皇家园林集大成者，融合南北造园特色，构建"一池三山"经典皇家格局。',
        significance: '为现代城市生态格局、大型滨水公园规划提供范本，其山水生态系统对城市生态建设具有重要价值。'
    },
    "狮子林": {
        impact: '元代禅意园林代表，以大规模假山群闻名，将禅宗意境与叠山技艺融为一体。',
        significance: '为现代互动景观、体验式园林设计提供灵感，在传统叠山技艺传承中具有重要价值。'
    },
    "艺圃": {
        impact: '明代文人园林，以简朴自然、疏朗明快的风格著称，体现了文人隐逸生活理想。',
        significance: '为现代庭院设计提供了"简而不陋、朴而不俗"的审美范本。'
    },
    "耦园": {
        impact: '清代苏州园林，以"耦"为主题，布局成双成对，体现了夫妻偕隐的浪漫情怀。',
        significance: '其主题性造景思路对现代主题景观设计具有启发。'
    },
    "退思园": {
        impact: '清代同里园林，以"退思补过"为主题，布局紧凑精巧，是小型文人园林的典范。',
        significance: '为现代庭院、精品酒店景观提供设计参考，其"小中见大"的空间策略值得学习。'
    },
    
    // ==================== 第4层：现代影响 ====================
    "现代景观空间理论": {
        impact: '中国古典园林的空间智慧为现代景观理论提供丰富资源，步移景异、小中见大等手法被转化为现代设计语言。',
        significance: '推动本土化设计理论形成与发展，对当代景观设计的文化自信与创新提供坚实基础。'
    },
    "生态修复与海绵城市": {
        impact: '古典园林的理水智慧、因地制宜理念为现代生态修复与海绵城市建设提供传统智慧。',
        significance: '在当代城市雨洪管理、生态湿地建设、水环境修复中得到应用。'
    },
    "乡土材料与技艺复兴": {
        impact: '古典园林对地方材料的精妙运用，启发当代对乡土建材与传统工艺的重视。',
        significance: '促进传统造园技艺的非遗保护与传承，在当代乡村建设、文化景观营造中发挥重要作用。'
    },
    "公共园林与社区设计": {
        impact: '古典园林的开放共享理念、公共游赏功能，为现代城市公园与社区景观设计提供历史参照。',
        significance: '推动历史园林的公共化利用，在社区花园、口袋公园、城市更新项目中体现传统园林的当代价值。'
    },
    "建筑与室内意境营造": {
        impact: '园林的借景、框景、对景等手法被引入现代建筑与室内设计，创造"室内园林"的空间体验。',
        significance: '在精品酒店、文化建筑、高端住宅中广泛应用，形成具有东方美学特色的空间设计语言。'
    },
    "文化遗产保护理念": {
        impact: '古典园林的保护实践积累了丰富经验，形成从单体修复到整体格局保护的系统性理论与方法。',
        significance: '为当代文化遗产保护提供重要参考，推动整体性保护与活态传承理念的实践创新。'
    },
    "生态文化景观": {
        impact: '将古典园林的比德思想与现代生态理念相结合，创造具有文化内涵的生态景观空间。',
        significance: '在当代生态公园、文化景观建设中，传统比德思想为景观赋予文化深度与精神价值。'
    }
};
    
    const modal = document.getElementById('sankey-modal');
    const detail = sankeyNodeDetails[name];
    
    if (!detail) {
        console.warn('未找到该节点的详情数据:', name);
        // 为未添加数据的节点提供通用提示
        modal.innerHTML = `
            <div class="sankey-scroll-content">
                <span class="sankey-scroll-close" onclick="closeSankeyModal()"><i class="fa-solid fa-xmark"></i></span>
                <h2 class="scroll-title">${name}</h2>
                <div class="scroll-section">
                    <p style="text-align: center; color: #999; padding: 40px 0;">
                        <i class="fa-solid fa-info-circle" style="font-size: 48px; margin-bottom: 15px; display: block;"></i>
                        该节点详情正在整理中，敬请期待...
                    </p>
                </div>
            </div>
        `;
        modal.style.display = 'flex';
        return;
    }
    
    const content = `
        <div class="sankey-scroll-content">
            <span class="sankey-scroll-close" onclick="closeSankeyModal()"><i class="fa-solid fa-xmark"></i></span>
            <h2 class="scroll-title">${name}</h2>
            <div class="scroll-section">
                <h3><i class="fa-solid fa-landmark"></i> 历史影响</h3>
                <p style="white-space: pre-line;">${detail.impact}</p>
            </div>
            <div class="scroll-section">
                <h3><i class="fa-solid fa-seedling"></i> 现实意义</h3>
                <p style="white-space: pre-line;">${detail.significance}</p>
            </div>
            <div class="scroll-decoration">
                <i class="fa-solid fa-leaf"></i>
                <p style="font-size: 0.8rem; margin-top: 10px; color: #999;">— 园林风雅 · 薪火相传 —</p>
            </div>
        </div>
    `;
    
    modal.innerHTML = content;
    modal.style.display = 'flex';
}

function closeSankeyModal() {
    const modal = document.getElementById('sankey-modal');
    modal.style.display = 'none';
}

// --- 页面初始化入口 ---
function initPage(pageName) {
    console.log("初始化页面: " + pageName);
     if (typeof restoreNightMode === 'function') {
        restoreNightMode();
    }
    try {
        // 公共初始化：水墨动画系统
        initInkSystem();

        if (pageName === 'gallery') {
            if (!chartsInitialized) {
                buildTimeline();
                const pieEl = document.getElementById('pieChart');
                const lineEl = document.getElementById('lineChart');
                if(pieEl) {
                    pieChart = echarts.init(pieEl);
                    pieChart.on('click', function (params) {
                        if (params.name) showGardensForRegion(params.name);
                    });
                }
                if(lineEl) initLineChart();
                
                // 立即进行首次数据刷新（显示列表和图表），不等待地图
                try {
                    refreshByEra();
                } catch (e) {
                    console.warn("初始数据刷新失败，可能数据尚未就绪:", e);
                }
                
                // 异步初始化地图
                initMap();
                chartsInitialized = true;
            }
            
            // 初始化时间轴Intersection Observer
            setTimeout(() => {
                initTimelineObserver();
            }, 100);
            
            setTimeout(() => {
                try {
                    if (mapInstance) mapInstance.resize();
                    if (lineChart) lineChart.resize();
                    if (pieChart) pieChart.resize();
                } catch (e) {}
            }, 160);
        }

        if (pageName === 'game') {
    // 演变史页面：初始化 3D 意象球
    if (!wordCloudInitialized) {
        init3DWordCloud();
        wordCloudInitialized = true;
    }
    // 初始化时间轴Intersection Observer
    initTimelineObserver();
}

        if (pageName === 'philosophy') {
            // 人物与著作页面：初始化桑基图
            initSankeyChart();
            restoreNightMode();
        }

        if (pageName === 'fun') {
            // 园趣页面：初始化营造小游戏
            renderGame();
            console.log("园趣页面已初始化，AI 智能体已就绪。");
            initFlyFlowerGame();
            initPhotoInsight();
        }
    } catch (err) {
        console.error("页面初始化过程中发生错误:", err);
    }
}

// --- 初始加载 ---
// 不再直接覆盖 window.onload，而是通过 addEventListener 确保不会冲突
window.addEventListener('load', () => {
    // 如果 body 没有 onload 属性，则尝试运行默认初始化（如登录页）
    if (!document.body.getAttribute('onload')) {
        console.log("检测到页面未设置 onload 属性，执行默认逻辑");
        // 可以在这里放置通用的背景初始化逻辑
        initInkSystem();
    }
});
// 调用阿里通义千问 API

// 获取元素
const coupletBtn = document.getElementById('couplet-btn');
let chatModal = document.getElementById('ai-chat-modal');
let chatInput = document.getElementById('ai-chat-input');
let sendBtn = document.getElementById('ai-chat-send');
let messagesContainer = document.getElementById('ai-chat-messages');
let chatClose = document.getElementById('ai-chat-close');

// 如果弹窗不存在，动态创建
if (!chatModal) {
    createAIChatModal();
    // 重新获取元素
    chatModal = document.getElementById('ai-chat-modal');
    chatInput = document.getElementById('ai-chat-input');
    sendBtn = document.getElementById('ai-chat-send');
    messagesContainer = document.getElementById('ai-chat-messages');
    chatClose = document.getElementById('ai-chat-close');
}

// 动态创建 AI 对话弹窗
function createAIChatModal() {
    const modalHTML = `
        <div id="ai-chat-modal" class="ai-chat-modal" style="display: none;">
            <div class="ai-chat-container">
                <div class="ai-chat-header">
                    <h3><i class="fa-solid fa-wand-magic-sparkles"></i> AI 对联接龙 · 园林雅趣</h3>
                    <button class="ai-chat-close" id="ai-chat-close">&times;</button>
                </div>
                <div class="ai-chat-messages" id="ai-chat-messages">
                    <div class="ai-message bot">
                        <i class="fa-solid fa-leaf"></i>
                        <div class="message-text">🎋 欢迎来到园林对联接龙！我会出上联，您来对下联。对完后我会点评并出新的上联。准备好了吗？让我先出一个：<br><br>📜 <strong>上联：叠石引泉来雅趣</strong></div>
                    </div>
                </div>
                <div class="ai-chat-input-area">
                    <textarea id="ai-chat-input" placeholder="输入您的下联..." rows="2"></textarea>
                    <button id="ai-chat-send" class="ai-chat-send">
                        <i class="fa-solid fa-paper-plane"></i> 应对
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// 打开弹窗
if (coupletBtn) {
    coupletBtn.onclick = () => {
        if (chatModal) {
            // 确保 messagesContainer 指向正确的元素
            messagesContainer = document.getElementById('ai-chat-messages');
            chatModal.style.display = 'flex';
        }
    };
}

// 关闭弹窗
if (chatClose) {
    chatClose.onclick = () => {
        if (chatModal) chatModal.style.display = 'none';
    };
}

// 添加消息到对联接龙弹窗
function addCoupletMessage(text, sender) {
    if (!messagesContainer) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-message ${sender}`;
    
    const icon = sender === 'user' 
        ? '<i class="fa-solid fa-user"></i>' 
        : '<i class="fa-solid fa-leaf"></i>';
    
    msgDiv.innerHTML = `
        ${icon}
        <div class="message-text" style="white-space: pre-wrap; line-height: 1.5;">${escapeHtml(text)}</div>
    `;
    
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return msgDiv;
}

// 显示加载中
function showLoading() {
    if (!messagesContainer) return;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ai-message bot';
    loadingDiv.id = 'ai-loading';
    loadingDiv.innerHTML = `
        <i class="fa-solid fa-leaf"></i>
        <div class="message-text">🎋 正在品读您的下联...<span class="dot">.</span></div>
    `;
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 移除加载中
function removeLoading() {
    const loading = document.getElementById('ai-loading');
    if (loading) loading.remove();
}

// 防止 XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// 调用阿里通义千问 API
async function callCoupletAPI(userInput) {
    return GardenApp.ask('couplet', userInput);
}
// 发送消息
async function sendMessage() {
    if (!chatInput || sendBtn?.disabled) return;
    
    const userInput = chatInput.value.trim();
    if (!userInput) return;
    
    // 添加用户消息
    addCoupletMessage(userInput, 'user');
    chatInput.value = '';
    
    // 显示加载状态
    if (sendBtn) sendBtn.disabled = true;
    showLoading();
    
    try {
        const reply = await callCoupletAPI(userInput);
        removeLoading();
        addCoupletMessage(reply, 'bot');
    } catch (error) {
        removeLoading();
        console.error('API 错误:', error);
        addCoupletMessage(error.message, 'bot');
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
}

// 绑定发送按钮事件
if (sendBtn) {
    sendBtn.onclick = sendMessage;
}

// 回车发送
if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.ctrlKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}
if (typeof sendAIQuestion === 'function') {
    const questionInput = document.getElementById('ai-question-input');
    const askBtn = document.getElementById('ai-ask-btn');
    const suggestionItemsList = document.querySelectorAll('#suggestions-list li');

    if (askBtn) {
        askBtn.onclick = sendAIQuestion;
    }

    if (questionInput) {
        questionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendAIQuestion();
            }
        });
    }

    if (suggestionItemsList.length > 0) {
        suggestionItemsList.forEach(item => {
            item.style.cursor = 'pointer';
            item.onclick = () => {
                const question = item.getAttribute('data-question');
                if (question && questionInput) {
                    questionInput.value = question;
                    sendAIQuestion();
                }
            };
        });
    }
}
// ========== AI 园林诗词赏析（弹窗版）==========
const poemBtn = document.getElementById('poem-btn');

// 动态创建诗词赏析弹窗
let poemModal = null;
let poemInputField = null;

function createPoemModal() {
    if (document.getElementById('poem-modal')) return;
    
    const modalHTML = `
        <div id="poem-modal" class="ai-chat-modal" style="display: none;">
            <div class="ai-chat-container" style="width: 500px; height: auto; min-height: 400px;">
                <div class="ai-chat-header" style="background: #2d6a4f;">
    <h3 style="color: #ffffff; margin: 0;"><i class="fa-solid fa-leaf"></i> 园林诗词赏析</h3>
    <button class="ai-chat-close" id="poem-modal-close" style="color: #ffffff;">&times;</button>
</div>
                <div style="padding: 20px;">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: var(--title-color);">📜 输入园林诗词：</label>
                        <textarea id="poem-input-text" rows="4" placeholder="例如：&#10;池塘生春草，园柳变鸣禽&#10;或&#10;虽由人作，宛自天开" style="width: 100%; padding: 10px; border: 1px solid var(--bg-divider); border-radius: 8px; background: var(--page-bg-1); color: var(--body-text); font-family: inherit; resize: vertical; box-sizing: border-box;"></textarea>
                    </div>
                    <button id="poem-submit-btn" style="width: 100%; padding: 10px; background: var(--emphasis); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">
                        <i class="fa-solid fa-microphone"></i> AI 赏析
                    </button>
                    <div id="poem-result-area" style="margin-top: 20px; padding: 15px; background: rgba(139,58,58,0.05); border-radius: 8px; display: none;">
                        <div style="font-weight: bold; margin-bottom: 8px; color: var(--emphasis);">
                            <i class="fa-solid fa-quote-left"></i> 赏析结果
                        </div>
                        <div id="poem-result-content" style="line-height: 1.8; font-size: 14px; color: var(--body-text);"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    poemModal = document.getElementById('poem-modal');
    poemInputField = document.getElementById('poem-input-text');
    const closeBtn = document.getElementById('poem-modal-close');
    const submitBtn = document.getElementById('poem-submit-btn');
    const resultArea = document.getElementById('poem-result-area');
    const resultContent = document.getElementById('poem-result-content');
    
    // 关闭弹窗
    if (closeBtn) {
        closeBtn.onclick = () => {
            if (poemModal) poemModal.style.display = 'none';
        };
    }
    
    // 提交赏析
    if (submitBtn) {
        submitBtn.onclick = async () => {
            const poem = poemInputField?.value.trim();
            if (!poem) {
                alert('请输入一句园林诗词');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 赏析中...';
            resultArea.style.display = 'block';
            resultContent.innerHTML = '🌿 正在品读诗意...';
            
            try {
                const result = await GardenApp.ask('poem', poem);
                resultContent.style.whiteSpace = 'pre-wrap';
                resultContent.textContent = result;
            } catch (error) {
                console.error('API 错误:', error);
                resultContent.innerHTML = '🍃 赏析失败，请稍后再试。';
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> AI 赏析';
            }
        };
    }
}

// 打开诗词赏析弹窗
if (poemBtn) {
    poemBtn.onclick = () => {
        createPoemModal();
        if (poemModal) {
            poemModal.style.display = 'flex';
            if (poemInputField) poemInputField.value = '';
            const resultArea = document.getElementById('poem-result-area');
            if (resultArea) resultArea.style.display = 'none';
        }
    };
}
function initSchoolTree() {
    const chartDom = document.getElementById('school-tree');
    if (!chartDom) return;
    const myChart = echarts.getInstanceByDom(chartDom) || echarts.init(chartDom);
    myChart.off('click');

    const schoolData = {
        name: "中国造园流派",
        children: [
            {
                name: "香山帮",
                info: {
                    type: "school",
                    period: "明至今",
                    skill: "木作（苏作木构）、叠山（土山戴石）、理水、彩绘、雕饰",
                    works: "苏州拙政园/留园/网师园、北京故宫、南京夫子庙",
                    extra: "世界非遗核心传承，江南园林营造之灵魂。"
                },
                children: [
                    { name: "蒯祥", info: { period: "明代", skill: "准绳尺度、金刚腿", works: "天安门、故宫前三殿", extra: "香山帮鼻祖，人称‘蒯鲁班’。" } },
                    { name: "姚承祖", info: { period: "清末民初", skill: "系统总结苏派技法", works: "怡园、网师园修复", extra: "著《营造法原》，香山帮技法集大成者。" } },
                    { name: "张南垣", info: { period: "明末清初", skill: "以画意入叠山", works: "豫园、寄畅园", extra: "明代叠山名家，开创‘土石相间’风格。" } },
                    { name: "戈裕良", info: { period: "清中期", skill: "钩带法叠石", works: "环秀山庄假山", extra: "不用铁活固定，山石浑然一体。" } },
                    { name: "周秉忠", info: { period: "明代", skill: "叠山/制器名家", works: "苏州名园小品", extra: "精于园林小品与器物营造。" } }
                ]
            },
            {
                name: "样式雷世家",
                info: {
                    type: "school",
                    period: "清代",
                    skill: "平样图纸、烫样（立体模型）、样式房管理",
                    works: "圆明园、颐和园、承德避暑山庄、清东西陵",
                    extra: "清代皇家园林的幕后总设计师，七代执掌样式房。"
                },
                children: [
                    { name: "雷发达", info: { period: "清康熙", skill: "楠木作总匠人", works: "早期皇家工程", extra: "样式雷第一代，奠定家族基业。" } },
                    { name: "雷金玉", info: { period: "清雍正", skill: "圆明园规划设计", works: "圆明园、太和殿", extra: "样式雷鼎盛时期代表人物。" } },
                    { name: "雷景修", info: { period: "清道光/咸丰", skill: "图档整理与留存", works: "皇家工程档案", extra: "整理并保留了极其珍贵的样式雷烫样与图纸。" } },
                    { name: "雷家玺", info: { period: "清乾隆", skill: "园林景观宏观规划", works: "万寿山工程", extra: "负责了乾隆盛世多项重大园林建设。" } },
                    { name: "雷廷昌", info: { period: "清同治/光绪", skill: "皇家园林修复", works: "颐和园重修", extra: "清末皇家园林最后的守望者。" } }
                ]
            },
            {
                name: "岭南园林",
                info: {
                    type: "school",
                    period: "清至今",
                    skill: "镬耳墙、满洲窗、冷巷通风、三雕两塑",
                    works: "顺德清晖园、佛山梁园、东莞可园",
                    extra: "中西兼容、实用为先，热带植物造景特色鲜明。"
                },
                children: [
                    { name: "莫伯治", info: { period: "近现代", skill: "现代岭南园林理论", works: "广州白云山庄、泮溪酒家", extra: "将现代建筑理念植入传统园林。" } },
                    { name: "夏昌世", info: { period: "近现代", skill: "岭南园林先驱", works: "中山医学院园林", extra: "融合现代建筑与传统庭园。" } },
                    { name: "何世良", info: { period: "当代", skill: "砖雕非遗传承", works: "岭南园林修复", extra: "修复多处岭南园林精美砖雕装饰。" } },
                    { name: "民间匠师", info: { period: "历代", skill: "灰塑、陶瓷、木雕", works: "陈家祠、余荫山房", extra: "岭南民间艺术的集大成者。" } }
                ]
            },
            {
                name: "浙派园林",
                info: {
                    type: "school",
                    period: "宋至今",
                    skill: "借景湖山、自然理水、意境营造",
                    works: "杭州郭庄/刘庄/三潭印月",
                    extra: "依托西湖真山真水，‘园小乾坤大’的典范。"
                },
                children: [
                    { name: "陈从周", info: { period: "近现代", skill: "园林修复与理论", works: "豫园、网师园、明轩", extra: "著《说园》，被誉为‘中国园林之魂’。" } },
                    { name: "孙筱祥", info: { period: "近现代", skill: "风景园林规划", works: "杭州花港观鱼", extra: "‘中国现代风景园林之父’。" } },
                    { name: "李渔", info: { period: "清代", skill: "借景、小园精巧布局", works: "芥子园", extra: "著《闲情偶寄》，开创浙派先驱。" } },
                    { name: "丁文馨", info: { period: "当代", skill: "古典园林修复", works: "西湖名园提升", extra: "致力于浙派园林的传承与保护。" } }
                ]
            },
            {
                name: "川派/北方",
                children: [
                    {
                        name: "川派园林",
                        info: { period: "历代", skill: "穿斗结构、竹园结合、自然野趣", works: "杜甫草堂、武侯祠、望江楼", extra: "西蜀园林的代表，充满生活气息与野趣。" },
                        children: [
                            { name: "杨守敬", info: { period: "清代", skill: "规划修复", works: "蜀中名园", extra: "主持修复多处蜀中名园。" } },
                            { name: "张大千", info: { period: "近现代", skill: "绘画意境入园", works: "摩诘山园", extra: "将绘画审美融入园林实践。" } }
                        ]
                    },
                    {
                        name: "北方皇家体系",
                        info: { period: "辽金元明清", skill: "中轴线布局、金碧辉煌、气势恢宏", works: "故宫、北海、避暑山庄", extra: "代表了封建最高等级的营造规制。" },
                        children: [
                            { name: "宋徽宗", info: { period: "北宋", skill: "花石纲营造", works: "艮岳", extra: "宋代皇家园林巅峰，搜罗天下奇石。" } },
                            { name: "计成", info: { period: "明代", skill: "造园理论", works: "《园冶》", extra: "为中国造园提供了核心理论支撑。" } },
                            { name: "文徵明", info: { period: "明代", skill: "文人造园", works: "拙政园图、王府园林", extra: "融入江南文人意境于北方园林。" } }
                        ]
                    }
                ]
            }
        ]
    };

    const option = {
        series: [{
            type: 'tree',
            data: [schoolData],
            top: '5%', left: '15%', bottom: '5%', right: '15%',
            symbolSize: 10,
            itemStyle: { color: '#2d6a4f', borderColor: '#c0b090' },
            label: { position: 'left', align: 'right', fontSize: 13, fontFamily: 'STKaiti' },
            leaves: { label: { position: 'right', align: 'left' } },
            expandAndCollapse: true,
            initialTreeDepth: 2,
            animationDuration: 550,
            lineStyle: { color: '#dcd5c5', width: 1.5 }
        }]
    };

    myChart.setOption(option);

    myChart.on('click', function (params) {
        const data = params.data;
        const infoCard = document.getElementById('info-card');
        if (data.info) {
            infoCard.innerHTML = `
                <div class="detail-card">
                    <div style="font-size:12px; color:var(--emphasis); margin-bottom:5px;">${data.info.type === 'school' ? '◈ 流派概览' : '◈ 匠人/名士'}</div>
                    <h3>${data.name}</h3>
                    <div class="info-item"><span class="info-label"><i class="fa-solid fa-hourglass-start"></i> 时 期：</span><span class="info-val">${data.info.period}</span></div>
                    <div class="info-item"><span class="info-label"><i class="fa-solid fa-hammer"></i> 核心技艺：</span><span class="info-val">${data.info.skill}</span></div>
                    <div class="info-item"><span class="info-label"><i class="fa-solid fa-map-location-dot"></i> 代表作品：</span><span class="info-val">${data.info.works}</span></div>
                    <div class="info-item" style="margin-top:15px; background:rgba(45,106,79,0.05); padding:10px; border-radius:5px;">
                        <span class="info-label" style="width:auto;"><i class="fa-solid fa-feather-pointed"></i> 补充说明：</span><br>
                        <span class="info-val" style="display:block; margin-top:5px; font-style:italic; font-size:13px;">${data.info.extra}</span>
                    </div>
                </div>
            `;
        }
    });

    window.addEventListener('resize', () => myChart.resize());
}
// 确保在页面加载后初始化图表
window.addEventListener('load', function() {
    // 只有在人物与著作页面才初始化
    if(document.getElementById('school-tree')) {
        initSchoolTree(); 
    }
});
