// No direct imports like pygame or sys in browser JavaScript.
// Math.random() is used for random choices.

// Global constants
const WIDTH = 800;
const HEIGHT = 600;
const FPS = 60;

// Canvas and context
let canvas;
let ctx;

// Game state variables
let gameState = 'MENU'; // Possible states: 'MENU', 'INSTRUCTIONS', 'PLAYING', 'LEVEL_COMPLETE', 'GAME_OVER', 'VICTORY'
let animationFrameId = null; // To control requestAnimationFrame
let lastFrameTime = 0; // For performance.now() to track time

// Colors (RGB tuples in Python become CSS color strings in JS)
const BLACK = 'rgb(0, 0, 0)';
const WHITE = 'rgb(255, 255, 255)';

// Asset paths and loaded assets storage
const ASSET_PATHS = {
    background: "background.png",
    player: "player.png",
    alien1: "alien1.png",
    alien2: "alien2.png"
};
const loadedAssets = {};

// Keyboard state tracking
const pressedKeys = {};
window.addEventListener('keydown', (e) => {
    pressedKeys[e.code] = true;
    // Prevent default browser actions for common game keys (e.g., scrolling)
    if (['ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape', 'KeyR', 'KeyQ', 'KeyI'].includes(e.code)) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    pressedKeys[e.code] = false;
});

// --- Helper Functions ---

// Function to load a single image
function loadImage(path) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(`Failed to load image: ${path}`);
        img.src = path;
    });
}

// Function to load all game assets asynchronously
async function loadAllAssets() {
    const promises = Object.entries(ASSET_PATHS).map(async ([name, path]) => {
        loadedAssets[name] = await loadImage(path);
    });
    await Promise.all(promises);

    // Scale background image after loading, similar to pygame.transform.scale
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = WIDTH;
    tempCanvas.height = HEIGHT;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(loadedAssets.background, 0, 0, WIDTH, HEIGHT);
    loadedAssets.background = tempCanvas; // Store the scaled canvas as the background image
}

// Function to draw text on the canvas, similar to pygame.font.render and surface.blit
function drawText(surfaceCtx, text, size, color, center) {
    surfaceCtx.font = `${size}px Arial`; // Pygame's SysFont(None) is approximated with Arial
    surfaceCtx.fillStyle = color;
    surfaceCtx.textAlign = 'center';
    surfaceCtx.textBaseline = 'middle';
    surfaceCtx.fillText(text, center.x, center.y);
}

// --- Sprite Base Class and Groups (mimicking pygame.sprite.Sprite and pygame.sprite.Group) ---

class Sprite {
    constructor() {
        this.image = null; // Can be HTMLImageElement or HTMLCanvasElement (for Surface-like objects)
        this.rect = { x: 0, y: 0, width: 0, height: 0 }; // Represents the sprite's bounding box
        this.isAlive = true; // Used for 'killing' sprites
    }

    // Helper to set the sprite's rect based on its image/dimensions and a specific position type
    setRect(posType, x, y, width = null, height = null) {
        if (this.image) {
            this.rect.width = width !== null ? width : this.image.width;
            this.rect.height = height !== null ? height : this.image.height;
        } else if (width !== null && height !== null) { // For sprites that are just colored rectangles (Surface-like)
            this.rect.width = width;
            this.rect.height = height;
        } else {
            console.warn("Sprite initialized without image or explicit dimensions.");
            return;
        }

        // Calculate x, y based on the specified position type
        switch (posType) {
            case 'midbottom':
                this.rect.x = x - this.rect.width / 2;
                this.rect.y = y - this.rect.height;
                break;
            case 'midtop':
                this.rect.x = x - this.rect.width / 2;
                this.rect.y = y;
                break;
            case 'topleft':
                this.rect.x = x;
                this.rect.y = y;
                break;
            default: // Default to topleft if no specific type is given
                this.rect.x = x;
                this.rect.y = y;
        }
    }

    // Marks the sprite for removal from its group
    kill() {
        this.isAlive = false;
    }

    // Draws the sprite's image onto the given canvas context
    draw(surfaceCtx) {
        if (this.image) {
            surfaceCtx.drawImage(this.image, this.rect.x, this.rect.y, this.rect.width, this.rect.height);
        }
        // Subclasses that simulate pygame.Surface will have their image property set to a canvas,
        // so this generic draw method works for them too.
    }

    // Placeholder for update logic, to be overridden by subclasses
    update() {
        // To be overridden by subclasses
    }
}

class SpriteGroup {
    constructor() {
        this.sprites = [];
    }

    // Adds a sprite to the group
    add(sprite) {
        this.sprites.push(sprite);
    }

    // Updates all active sprites in the group and removes inactive ones
    update(...args) {
        this.sprites = this.sprites.filter(sprite => {
            if (sprite.isAlive) {
                sprite.update(...args);
                return true;
            }
            return false; // Remove dead sprites
        });
    }

    // Draws all sprites in the group
    draw(surfaceCtx) {
        this.sprites.forEach(sprite => sprite.draw(surfaceCtx));
    }

    // Returns the number of sprites in the group (equivalent to len(group))
    get length() {
        return this.sprites.length;
    }

    // Returns a copy of the sprites array (equivalent to group.sprites())
    spritesArray() {
        return [...this.sprites];
    }

    // Mimics pygame.sprite.groupcollide(group1, group2, dokill1, dokill2)
    static groupCollide(group1, group2, dokill1, dokill2) {
        const collisions = new Map(); // Map<sprite1, [sprite2, ...]>
        group1.sprites.forEach(s1 => {
            group2.sprites.forEach(s2 => {
                if (s1.isAlive && s2.isAlive && SpriteGroup.checkCollision(s1.rect, s2.rect)) {
                    if (!collisions.has(s1)) {
                        collisions.set(s1, []);
                    }
                    collisions.get(s1).push(s2);
                    if (dokill1) s1.kill();
                    if (dokill2) s2.kill();
                }
            });
        });
        return collisions;
    }

    // Mimics pygame.sprite.spritecollide(sprite, group, dokill)
    static spriteCollide(sprite, group, dokill) {
        const collided = [];
        if (!sprite.isAlive) return collided; // No collisions if the main sprite is dead

        group.sprites.forEach(s => {
            if (s.isAlive && SpriteGroup.checkCollision(sprite.rect, s.rect)) {
                collided.push(s);
                if (dokill) s.kill();
            }
        });
        return collided;
    }

    // Bounding box collision detection logic
    static checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
}

// Mimics pygame.sprite.GroupSingle
class SpriteGroupSingle extends SpriteGroup {
    constructor(sprite = null) {
        super();
        if (sprite) {
            this.add(sprite);
        }
    }

    // Ensures only one sprite is in the group
    add(sprite) {
        this.sprites = [sprite];
    }

    // Returns the single sprite in the group
    get sprite() {
        return this.sprites[0] || null;
    }
}

// --- Game Classes (Player, Bullet, Alien, EnemyBullet) ---

class Player extends Sprite {
    constructor() {
        super();
        this.image = loadedAssets.player; // Load player image
        this.setRect('midbottom', WIDTH / 2, HEIGHT - 10, 50, 60); // Set initial position and size
        this.speed = 3;
    }

    update() {
        // Handle player movement based on keyboard input
        if (pressedKeys['ArrowLeft'] && this.rect.x > 0) {
            this.rect.x -= this.speed;
        }
        if (pressedKeys['ArrowRight'] && (this.rect.x + this.rect.width) < WIDTH) {
            this.rect.x += this.speed;
        }
    }
}

class Bullet extends Sprite {
    constructor(pos) {
        super();
        // Simulate pygame.Surface((5, 15)) and fill(WHITE) by creating an offscreen canvas
        const bulletCanvas = document.createElement('canvas');
        bulletCanvas.width = 5;
        bulletCanvas.height = 15;
        const bulletCtx = bulletCanvas.getContext('2d');
        bulletCtx.fillStyle = WHITE;
        bulletCtx.fillRect(0, 0, 5, 15);
        this.image = bulletCanvas; // Store the canvas as the sprite's image
        this.setRect('midbottom', pos.x, pos.y, 5, 15);
        this.speed = 7;
    }

    update() {
        this.rect.y -= this.speed;
        // Kill bullet if it goes off-screen
        if (this.rect.y + this.rect.height < 0) {
            this.kill();
        }
    }
    // The base Sprite.draw method handles drawing the canvas image, so no specific draw method needed here.
}

class Alien extends Sprite {
    constructor(pos) {
        super();
        // Load and store both alien animation frames
        this.images = [
            loadedAssets.alien1,
            loadedAssets.alien2
        ];
        this.image_index = 0;
        this.image = this.images[this.image_index]; // Current image for animation
        this.setRect('topleft', pos.x, pos.y, 30, 20);
        this.last_animation_time = performance.now(); // For animation timing
    }

    update(moving_right, speed_multiplier) {
        // Move alien horizontally
        if (moving_right) {
            this.rect.x += 0.5 * speed_multiplier;
        } else {
            this.rect.x -= 0.5 * speed_multiplier;
        }

        // Handle alien animation
        const current_time = performance.now();
        if (current_time - this.last_animation_time >= 500) { // Change image every 500ms
            this.image_index = (this.image_index + 1) % this.images.length;
            this.image = this.images[this.image_index];
            this.last_animation_time = current_time; // Update timer
        }
    }
}

class EnemyBullet extends Sprite {
    constructor(pos) {
        super();
        // Simulate pygame.Surface((5, 15)) and fill((255, 0, 0))
        const bulletCanvas = document.createElement('canvas');
        bulletCanvas.width = 5;
        bulletCanvas.height = 15;
        const bulletCtx = bulletCanvas.getContext('2d');
        bulletCtx.fillStyle = 'rgb(255, 0, 0)'; // Red color
        bulletCtx.fillRect(0, 0, 5, 15);
        this.image = bulletCanvas;
        this.setRect('midtop', pos.x, pos.y, 5, 15);
        this.speed = 3;
    }

    update() {
        this.rect.y += this.speed;
        // Kill bullet if it goes off-screen
        if (this.rect.y > HEIGHT) {
            this.kill();
        }
    }
    // The base Sprite.draw method handles drawing the canvas image.
}

// --- Game State Management ---

let currentLevel = 1;
let playerGroup;
let bulletGroup;
let enemyBulletGroup;
let alienGroup;
let initialAlienCount;
let alienShootIntervalId = null; // To store the setInterval ID for alien shooting
let movingRight;
const SHOOT_DELAY = 500;
let lastShotTime = 200;

// Functions for each game state's update logic
function updateMenu() {
    if (pressedKeys['Enter']) {
        pressedKeys['Enter'] = false; // Consume the key press
        gameState = 'PLAYING';
        startGameLoop(); // Initialize and start the game for the first level
    }
    if (pressedKeys['KeyI']) {
        pressedKeys['KeyI'] = false; // Consume the key press
        gameState = 'INSTRUCTIONS';
    }
}

// Functions for each game state's drawing logic
function drawMenu() {
    ctx.drawImage(loadedAssets.background, 0, 0);
    drawText(ctx, "Jeu Invader", 64, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 - 100 });
    drawText(ctx, "Appuyez sur ENTRER pour jouer", 48, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 });
    drawText(ctx, "Appuyez sur I pour voir les contrôles", 36, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 + 60 });
}

function updateInstructions() {
    if (pressedKeys['Enter'] || pressedKeys['Escape']) {
        pressedKeys['Enter'] = false;
        pressedKeys['Escape'] = false;
        gameState = 'MENU'; // Return to menu
    }
}

function drawInstructions() {
    ctx.drawImage(loadedAssets.background, 0, 0);
    drawText(ctx, "Contrôles", 64, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 - 150 });
    drawText(ctx, "Flèche Gauche/Droite : Déplacer le joueur", 48, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 - 50 });
    drawText(ctx, "Espace : Tirer (avec délai entre chaque tir)", 48, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 });
    drawText(ctx, "Pendant le jeu : R pour rejouer", 48, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 + 50 });
    drawText(ctx, "Appuyez sur ENTER ou ESC pour retourner au menu", 36, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 + 120 });
}

function updateLevelComplete() {
    if (pressedKeys['Enter'] || pressedKeys['Escape']) {
        pressedKeys['Enter'] = false;
        pressedKeys['Escape'] = false;
        currentLevel++; // Advance to next level
        if (currentLevel > 3) { // Check for victory condition
            gameState = 'VICTORY';
        } else {
            gameState = 'PLAYING';
            startGameLoop(); // Start the next level
        }
    }
}

function drawLevelComplete() {
    ctx.drawImage(loadedAssets.background, 0, 0);
    // Display the level that was just completed (currentLevel - 1)
    drawText(ctx, `Niveau ${currentLevel} terminé!`, 64, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 - 50 });
    drawText(ctx, "Appuyez sur ENTRER pour continuer", 48, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 + 50 });
}

function updateVictory() {
    if (pressedKeys['KeyR']) {
        pressedKeys['KeyR'] = false;
        currentLevel = 1; // Reset level for replay
        gameState = 'MENU'; // Go back to menu to restart
    } else if (pressedKeys['KeyQ']) {
        // In a browser, "quitting" means stopping the game loop and clearing timers
        cancelAnimationFrame(animationFrameId);
        if (alienShootIntervalId) clearInterval(alienShootIntervalId);
        console.log("Game exited.");
        // Optionally, hide the canvas or display a final message
    }
}

function drawVictory() {
    ctx.drawImage(loadedAssets.background, 0, 0);
    drawText(ctx, "Félicitations, vous avez gagner!", 64, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 - 50 });
    drawText(ctx, "Appuyez sur R pour rejouer", 48, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 + 50 });
}

function updateGameOver() {
    if (pressedKeys['KeyR']) {
        pressedKeys['KeyR'] = false;
        currentLevel = 1; // Reset level for replay
        gameState = 'MENU'; // Go back to menu to restart
    } else if (pressedKeys['KeyQ']) {
        cancelAnimationFrame(animationFrameId);
        if (alienShootIntervalId) clearInterval(alienShootIntervalId);
        console.log("Game exited.");
    }
}

function drawGameOver() {
    ctx.drawImage(loadedAssets.background, 0, 0);
    drawText(ctx, "Game Over!", 64, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 - 50 });
    drawText(ctx, "Appuyez sur R pour rejouer", 48, WHITE, { x: WIDTH / 2, y: HEIGHT / 2 + 50 });
}

// Initializes a new level, similar to Python's run_level setup
function startGameLoop() {
    // Initialize sprite groups for the new level
    playerGroup = new SpriteGroupSingle(new Player());
    bulletGroup = new SpriteGroup();
    enemyBulletGroup = new SpriteGroup();
    alienGroup = new SpriteGroup();

    // Populate aliens based on current level
    const rows = 3 + (currentLevel - 1);
    const cols = 10;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const alien = new Alien({ x: col * 60 + 50, y: row * 50 + 30 });
            alienGroup.add(alien);
        }
    }
    initialAlienCount = alienGroup.length; // Store initial count for speed multiplier

    // Clear any existing alien shooting timer
    if (alienShootIntervalId) {
        clearInterval(alienShootIntervalId);
    }
    // Set up new alien shooting timer (mimics pygame.time.set_timer with USEREVENT)
    const alienShootInterval = Math.max(600 - (currentLevel - 1) * 100, 300);
    alienShootIntervalId = setInterval(() => {
        if (alienGroup.length > 0) {
            // Randomly choose an alien to shoot
            const shooter = alienGroup.spritesArray()[Math.floor(Math.random() * alienGroup.length)];
            const enemyBullet = new EnemyBullet({ x: shooter.rect.x + shooter.rect.width / 2, y: shooter.rect.y + shooter.rect.height });
            enemyBulletGroup.add(enemyBullet);
        }
    }, alienShootInterval);

    movingRight = true; // Initial direction for aliens
    lastShotTime = performance.now(); // Reset player shot timer
}

// Update logic for the 'PLAYING' state (main game loop logic)
function updatePlaying() {
    // Player shooting logic
    if (pressedKeys['Space']) {
        const currentTime = performance.now();
        if (currentTime - lastShotTime > SHOOT_DELAY) {
            const playerSprite = playerGroup.sprite;
            if (playerSprite) { // Ensure player exists
                const bullet = new Bullet({ x: playerSprite.rect.x + playerSprite.rect.width / 2, y: playerSprite.rect.y });
                bulletGroup.add(bullet);
                lastShotTime = currentTime;
            }
        }
    }

    // Handle game exit/restart during active gameplay
    if (pressedKeys['KeyR']) {
        pressedKeys['KeyR'] = false;
        currentLevel = 1;
        gameState = 'MENU'; // Go back to menu to restart
        if (alienShootIntervalId) clearInterval(alienShootIntervalId); // Clear alien timer
        return; // Exit update to prevent further processing for this frame
    }
    if (pressedKeys['KeyQ']) {
        cancelAnimationFrame(animationFrameId); // Stop main game loop
        if (alienShootIntervalId) clearInterval(alienShootIntervalId); // Clear alien timer
        console.log("Game exited.");
        return; // Exit update
    }

    // Update all sprite groups
    playerGroup.update();
    bulletGroup.update();
    enemyBulletGroup.update();

    // Alien movement and direction change logic
    let changeDirection = false;
    for (const alien of alienGroup.spritesArray()) {
        if (movingRight && (alien.rect.x + alien.rect.width) >= WIDTH) {
            changeDirection = true;
            break;
        } else if (!movingRight && alien.rect.x <= 0) {
            changeDirection = true;
            break;
        }
    }

    if (changeDirection) {
        movingRight = !movingRight; // Reverse direction
        const descentAmount = 10 + (currentLevel * 5); // Aliens descend more with higher levels
        alienGroup.sprites.forEach(alien => {
            alien.rect.y += descentAmount;
        });
    }

    // Calculate alien speed multiplier based on remaining aliens
    let speedMultiplier = 1;
    if (alienGroup.length > 0) {
        speedMultiplier = 1 + (initialAlienCount - alienGroup.length) / initialAlienCount;
    }
    alienGroup.update(movingRight, speedMultiplier);

    // Collision detection
    SpriteGroup.groupCollide(bulletGroup, alienGroup, true, true); // Player bullets hit aliens

    // Player hit by enemy bullet
    if (playerGroup.sprite && SpriteGroup.spriteCollide(playerGroup.sprite, enemyBulletGroup, true).length > 0) {
        if (alienShootIntervalId) clearInterval(alienShootIntervalId);
        gameState = 'GAME_OVER';
        return;
    }

    // Player hit by alien (alien reaches player)
    if (playerGroup.sprite && SpriteGroup.spriteCollide(playerGroup.sprite, alienGroup, false).length > 0) {
        if (alienShootIntervalId) clearInterval(alienShootIntervalId);
        gameState = 'GAME_OVER';
        return;
    }

    // Check for level completion (all aliens defeated)
    if (alienGroup.length === 0) {
        if (alienShootIntervalId) clearInterval(alienShootIntervalId);
        gameState = 'LEVEL_COMPLETE';
        return;
    }
}

// Drawing logic for the 'PLAYING' state
function drawPlaying() {
    ctx.drawImage(loadedAssets.background, 0, 0); // Draw background
    playerGroup.draw(ctx);
    bulletGroup.draw(ctx);
    enemyBulletGroup.draw(ctx);
    alienGroup.draw(ctx);
    drawText(ctx, `Niveau ${currentLevel}`, 36, WHITE, { x: 70, y: 20 }); // Display current level
}

// Main game loop function, called by requestAnimationFrame
function gameLoop(timestamp) {
    // Calculate delta time if needed for frame-rate independent movement (not strictly used here as speeds are fixed)
    // const elapsed = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    ctx.clearRect(0, 0, WIDTH, HEIGHT); // Clear the entire canvas each frame

    // Call update and draw functions based on the current game state
    switch (gameState) {
        case 'MENU':
            updateMenu();
            drawMenu();
            break;
        case 'INSTRUCTIONS':
            updateInstructions();
            drawInstructions();
            break;
        case 'PLAYING':
            updatePlaying();
            drawPlaying();
            break;
        case 'LEVEL_COMPLETE':
            updateLevelComplete();
            drawLevelComplete();
            break;
        case 'GAME_OVER':
            updateGameOver();
            drawGameOver();
            break;
        case 'VICTORY':
            updateVictory();
            drawVictory();
            break;
    }

    // Request the next animation frame, creating a continuous loop
    animationFrameId = requestAnimationFrame(gameLoop);
}

// --- Initialization ---
// This runs when the HTML document is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Create and append the canvas element to the body
    canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');

    // Set the browser window title (equivalent to pygame.display.set_caption)
    document.title = "Jeu Invader";

    // Load all assets before starting the game loop
    try {
        await loadAllAssets();
        // Start the main game loop after all assets are successfully loaded
        animationFrameId = requestAnimationFrame(gameLoop);
    } catch (error) {
        console.error("Error loading game assets:", error);
        // Display an error message on screen if assets fail to load
        ctx.fillStyle = BLACK;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        drawText(ctx, "Erreur de chargement des assets!", 48, 'red', { x: WIDTH / 2, y: HEIGHT / 2 });
    }
});
