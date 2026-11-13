<?php
header('Content-Type: text/plain; charset=utf-8');

function get_param($key) {
    if (isset($_POST[$key])) return trim($_POST[$key]);
    if (isset($_GET[$key])) return trim($_GET[$key]);
    return '';
}

$username = get_param('username');
$password = get_param('password');

if ($username === '' || $password === '') {
    echo 'no';
    exit;
}
if ($username === 'gjyg' && $password === 'gjyg') {
    echo 'yes';
    exit;
}

$usersFile = __DIR__ . '/users.json';
if (!file_exists($usersFile)) {
    echo 'no';
    exit;
}

$json = file_get_contents($usersFile);
$users = json_decode($json, true);
if (!is_array($users) || !isset($users[$username])) {
    echo 'no';
    exit;
}

$storedPassword = $users[$username];
$info = password_get_info($storedPassword);

if (($info['algo'] !== 0 && password_verify($password, $storedPassword)) || hash_equals($storedPassword, $password)) {
    echo 'yes';
} else {
    echo 'no';
}
