// Paladin Survival RPG — configuración central de balance.
// Todos los números de gameplay viven aquí. La lógica (src/sim) los lee; nunca los duplica.
// Ver README.md → "Cómo modificar el balance".

function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  }
  return Object.freeze(obj);
}

export const ATTRIBUTE_KEYS = Object.freeze(['maxHp', 'attack', 'defense', 'speed', 'attackSpeed']);
export const ENEMY_TYPES = Object.freeze(['minor', 'brute', 'stalker']);

export const CONFIG = deepFreeze({
  arena: {
    width: 1440,
    height: 810,
    spawnOffset: 30,          // px fuera del borde donde nacen los enemigos
  },

  layout: {
    designWidth: 1920,        // escenario lógico completo (arena + HUD) que se escala proporcionalmente
    designHeight: 1080,
  },

  simulation: {
    fixedDt: 1 / 120,         // paso fijo de la simulación (segundos)
    maxFrameDt: 0.25,         // máximo tiempo real consumido por frame (evita espiral de muerte)
  },

  player: {
    radius: 18,
    baseMaxHp: 100,
    baseAttack: 10,
    baseDefense: 10,
    baseSpeed: 240,           // px/s
    baseAttackSpeed: 2.0,     // golpes por segundo → cooldown = 1 / attackSpeed
    maxSpeed: 520,
    maxAttackSpeed: 6,
    hearts: 5,                // corazones mostrados; cada uno = maxHp / hearts
    invulnTime: 0.6,          // i-frames tras recibir daño (s)
    hurtFlashTime: 0.25,
  },

  progression: {
    // xpToNext(level) = round(xpBase * xpGrowth^(level - 1))
    xpBase: 18,
    xpGrowth: 1.22,           // curva suave: un nivel cada ~20 s hasta el minuto 10 (medido con tools/balance-sim.mjs)
    // Mejora pasiva por nivel: fracción del valor BASE sumada a cada stat (todos los stats).
    passivePerLevel: { maxHp: 0.025, attack: 0.022, defense: 0.025, speed: 0.005, attackSpeed: 0.016 },
    // Punto manual: fracción del valor BASE sumada al stat elegido (claramente mayor que la pasiva).
    manualPerPoint: { maxHp: 0.15, attack: 0.12, defense: 0.15, speed: 0.05, attackSpeed: 0.09 },
    pointsPerLevel: 1,
    levelUpHealFraction: 0.2, // fracción de maxHp curada al subir de nivel (sostenibilidad sin regeneración)
    attributeLabels: {
      maxHp: 'Vida máxima',
      attack: 'Ataque',
      defense: 'Defensa',
      speed: 'Velocidad',
      attackSpeed: 'Vel. de ataque',
    },
  },

  sword: {
    swingDuration: 0.16,      // duración visual/activa del barrido (s)
    knockback: 40,            // px de empuje al impactar
    // Progresión del arma SEPARADA de los atributos: depende de kills acumuladas.
    tiers: [
      { id: 'common',     name: 'Espada común',     killsRequired: 0,   damageMult: 1.00, range: 72,  arcDeg: 100 },
      { id: 'reinforced', name: 'Espada reforzada', killsRequired: 40,  damageMult: 1.25, range: 80,  arcDeg: 110 },
      { id: 'long',       name: 'Espada larga',     killsRequired: 120, damageMult: 1.50, range: 96,  arcDeg: 115 },
      { id: 'runic',      name: 'Espada rúnica',    killsRequired: 300, damageMult: 1.90, range: 106, arcDeg: 125 },
    ],
  },

  combat: {
    // daño recibido = max(minDamage, raw * defenseK / (defenseK + defense), raw * minDamageFraction)
    defenseK: 40,
    minDamage: 1,
    minDamageFraction: 0.1,
    enemyHurtFlashTime: 0.15,
    enemyHitStun: 0.2,         // s que un enemigo golpeado no avanza (además del knockback)
    enemyContactCooldown: 0.8, // cada enemigo golpea por contacto como máximo una vez por este intervalo
    contactRange: 3,           // px extra sobre (radio jugador + radio enemigo) que cuentan como contacto
  },

  // Efectos visuales efímeros que produce la simulación (state.effects). Duraciones en segundos.
  effects: {
    durations: { hit: 0.2, death: 0.45, playerHit: 0.3, levelUp: 0.9, swordUp: 1.2 },
    maxActive: 300,           // tope duro: si se supera se descarta el más viejo
  },

  enemies: {
    types: {
      minor:   { label: 'Diablillo',  radius: 12, hp: 20, damage: 8,  speed: 125, xp: 4,  score: 10 },
      brute:   { label: 'Bruto',      radius: 26, hp: 75, damage: 18, speed: 62,  xp: 12, score: 35 },
      stalker: { label: 'Acechador',  radius: 16, hp: 34, damage: 12, speed: 150, xp: 7,  score: 22,
                 dashSpeedMult: 2.2, dashDuration: 0.35, dashCooldown: 2.6, dashRange: 260 },
    },
    variantsPerType: 4,       // recolores cosméticos por arquetipo (3 × 4 = 12 apariencias)
    // Peso de aparición por tipo: min(max, base + perWave * (wave - fromWave)) si wave >= fromWave.
    spawnWeights: {
      minor:   { fromWave: 1, base: 1.0,  perWave: 0,    max: 1.0 },
      stalker: { fromWave: 2, base: 0.2,  perWave: 0.06, max: 0.7 },
      brute:   { fromWave: 3, base: 0.12, perWave: 0.04, max: 0.45 },
    },
    // Escalado individual (moderado). Nivel de referencia = nivel actual del jugador.
    scaling: {
      hpPerLevel: 0.01,       // se sube de nivel mucho más rápido: escalado por nivel más suave
      damagePerLevel: 0.012,
      speedPerWave: 0.005,
      speedMaxMult: 1.25,
    },
    separationStrength: 0.5,  // empuje entre enemigos superpuestos (evita apilamiento)
    separationIterations: 2,  // pasadas de separación por paso de simulación
  },

  waves: {
    baseCount: 5,             // enemigos_oleada = round(baseCount * growth^(wave - 1))
    growth: 1.35,             // pocos al principio, muchísimos después (oleadas más cortas → aceleración)
    spawnDuration: 28,        // los spawns de una oleada se reparten en este tiempo (s)
    waveDuration: 30,         // la siguiente oleada empieza a este tiempo (o antes si se limpió)
    clearedDelay: 3,          // si la oleada se limpia antes, esperar esto antes de la siguiente
    maxSimultaneous: 120,     // límite técnico de enemigos vivos; el excedente queda en cola
  },

  score: {
    timePointsPerSecond: 2,
    // El tiempo solo puntúa a ritmo completo si hubo una kill reciente; luego decae hasta idleMult.
    activityWindow: 8,        // s desde la última kill con puntos de tiempo completos
    activityDecay: 4,         // s de decaimiento lineal hasta idleMult tras activityWindow
    idleMult: 0,              // multiplicador de puntos de tiempo sin pelear
    killWaveBonus: 0.08,      // puntos por kill * (1 + killWaveBonus * (wave - 1))
  },

  leaderboard: {
    storageKey: 'paladin-survival-rpg.leaderboard.v1',
    nameStorageKey: 'paladin-survival-rpg.lastName.v1',
    maxEntries: 10,
    nameMaxLength: 12,
    defaultName: 'PALADIN',
  },
});
