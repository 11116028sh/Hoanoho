<?php
require_once dirname(__FILE__)."/../includes/dbconnection.inc.php";

if (isset($_POST['f']) || isset($_GET['f'])) {
    if(isset($_POST['f']))
        $hash = $_POST['f'];
    else if(isset($_GET['f']))
        $hash = $_GET['f'];

    if(isset($_POST['filePassword']))
        $password = $_POST['filePassword'];
    else if(isset($_GET['p']))
        $password = $_GET['p'];

    // try to get the file out
    $sql = "SELECT *, case when File_AccessPassword is not null then 1 else 0 end protected FROM sharedfiles WHERE Hash = '".$hash."' and File_ValidDate >= NOW()";
    $result = mysql_query($sql);
    $curr_file = mysql_fetch_assoc($result);

    // if the query was invalid or failed to return a result, an generous message is shown
    if (!$result || !mysql_num_rows($result)) {
        exit;
    }

    // if file is protected by password
    if ($curr_file['protected'] == 1 && !isset($password)) {
        exit;
    } elseif ($curr_file['protected'] == 1 && isset($password)) {
        if ($password != $curr_file['File_AccessPassword']) {
            exit;
        }
    }

    $type = $curr_file['File_Type'];
    $size = "";
    if(!strstr($type, "image"))
        $size = $curr_file['File_Size'];
    $name = $curr_file['File_Name'];
    $content = $curr_file['File_Content'];
    $extension = $curr_file['File_Extension'];
    $counter = $curr_file['Counter'];
    $sid = $curr_file['SID'];

    header("Content-length: ".$size."");
    header("Content-type: ".$type."");
    header('Content-Disposition: attachment; filename="'.$name.'"');
    echo $content;
}

?>
