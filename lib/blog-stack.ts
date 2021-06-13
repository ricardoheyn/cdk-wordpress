import * as cdk from '@aws-cdk/core';
import * as ecs from "@aws-cdk/aws-ecs"
import * as ec2 from '@aws-cdk/aws-ec2';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as rds from '@aws-cdk/aws-rds';

export class BlogStack extends cdk.Stack {

    constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, 'MyVpc')

        const wordpressSg = new ec2.SecurityGroup(this, 'WordpressSG', {
            vpc: vpc,
            description: 'Wordpress SG',
        });

        const instance = new rds.DatabaseInstance(this, 'Instance', {
            engine: rds.DatabaseInstanceEngine.mysql({version: rds.MysqlEngineVersion.VER_8_0_19,}),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
            securityGroups: [wordpressSg],
            databaseName: "wordpress",
            vpc: vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE,
            }
        });
        new cdk.CfnOutput(this, "db-url", {value: instance.dbInstanceEndpointAddress})

        const cluster = new ecs.Cluster(this, "MyCluster", {
            vpc: vpc,
        });

        const fargateTaskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
            memoryLimitMiB: 512,
            cpu: 256,
        });

        const wordpress = fargateTaskDefinition.addContainer("wordpress", {
            image: ecs.ContainerImage.fromRegistry("wordpress")
        });
        wordpress.addPortMappings({
            containerPort: 80,
        })

        const service = new ecs.FargateService(this, 'Service', {
            cluster: cluster,
            taskDefinition: fargateTaskDefinition,
            desiredCount: 1
        });
        service.connections.addSecurityGroup(wordpressSg);
        service.connections.allowTo(wordpressSg, ec2.Port.tcp(3306));

        const targetGrp = new elbv2.ApplicationTargetGroup(this, "targetgrp", {
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [service],
            vpc: vpc,
            healthCheck: {
                healthyHttpCodes: "200,301,302",
            }
        })

        const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
            vpc: vpc,
            internetFacing: true,
        });
        new cdk.CfnOutput(this, "alb-url", {value: "http://" + lb.loadBalancerDnsName})

        const listener = lb.addListener('Listener', {
            port: 80,
        });

        listener.addTargetGroups("targetgrpadd", {
            targetGroups: [targetGrp],
        })
    }
}