<?
	include $_SERVER['DOCUMENT_ROOT'].'/includes/dbconnection.php';
	include $_SERVER['DOCUMENT_ROOT'].'/includes/sessionhandler.php';
	include $_SERVER['DOCUMENT_ROOT'].'/includes/getConfiguration.php';

	if(!isset($_GET['room']))
		header('Location: ' . $protocol . '://' . $_SERVER['HTTP_HOST'] . '/mobile/index.php');

	$sql = "SELECT * FROM rooms where room_id = " . $_GET['room'];
	$result = mysql_query($sql);
	$room = mysql_fetch_object($result);
?>

<html>
	<head>
		<meta charset="UTF-8" />
		<meta name="apple-mobile-web-app-capable" content="yes" /> 
		<meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no">
		
		<link rel="stylesheet" href="./css/ratchet.css" type="text/css" media="screen" title="no title" charset="UTF-8">

		<link rel="apple-touch-icon" href="../img/favicon.ico"/>
		<link rel="shortcut icon" type="image/x-icon" href="../img/favicon.ico" />

		<script src="./js/ratchet.js"></script>
		<script src="./js/standalone.js"></script>

		<title><? echo $__CONFIG['main_sitetitle'] . " - " . utf8_encode($room->name); ?></title>
	</head>
	<body>
		<header class="bar-title">
			<a class="button-prev" href="automation.php" data-transition="slide-out">Zurück</a>
	    	<h1 class="title"><? echo utf8_encode($room->name); ?></h1>
	  	</header>

	  	<div class="content">  
		    <ul class="list">
		    	<?
		    		$sql = "SELECT * FROM devices where room_id = " . $_GET['room'] . " and devices.isHidden != 'on'";
		    		$result = mysql_query($sql);
		    		while ($device = mysql_fetch_object($result)) {
		    			echo "<li><a href=\"device.php?room=".$room->room_id."&device=".$device->dev_id."\" data-transition=\"slide-in\" data-ignore=\"push\">".utf8_encode($device->name)."</a>";
          				echo "<span class=\"chevron\"></span></li>";
		    		}
		    	?>
			</ul>
			<br><br><br>
		</div>
		
		<? include "includes/nav.php"; ?>
	</body>
</html>